import {
    Uri, WorkspaceConfiguration, CompletionItem, WebviewPanel, CompletionList,
    MarkdownString, SnippetString, CompletionItemKind, extensions, window
} from 'vscode';
import { getMathMarkdown } from './math_render'
import { command_docs } from "./lmp_doc";
import { join } from 'path'

export function getColor() {
    const math_colors: string[] = ["#000000", "#ffffff", "#ffffff"]
    const color: string = math_colors[window.activeColorTheme.kind - 1]
    return color
}

export interface doc_entry {
    command: string[];
    syntax: string;
    args: {
        arg: string;
        type: number;
        choices: string[];
    }[];
    parameters: string;
    examples: string;
    html_filename: string;
    short_description: string;
    description: string;
    restrictions: string;
    related: string;
}

/** Searches a string for Markdown-Image links and adds the extension path to
 * the image url if argument b_img is true, otherwise it deletes the link to remove 
 * the image from the text.*/
export function fix_img_path(txt: string, b_img: boolean, web_panel: WebviewPanel | undefined): string {
    const img: (RegExpMatchArray | null)[] = [txt.match(RegExp('\\!\\[Image\\]\\((.*?)\\)'))]
    if (img[0]) {
        let ex_dir = extensions.getExtension('ThFriedrich.lammps')?.extensionPath;
        img.forEach(im => {
            if (b_img && ex_dir) {
                const md_str: string = join(ex_dir, 'rst', im![1])
                if (web_panel) {
                    const web_uri: string = web_panel.webview.asWebviewUri(Uri.file(md_str)).toString()
                    txt = txt.replace(im![1], web_uri)
                } else {
                    txt = txt.replace(im![1], md_str)
                }
            } else {
                txt = txt.replace(im![0], "")
            }
        });
    }
    return txt
}


export function getDocumentation(snippet: string): doc_entry | undefined {

    const sub_com = snippet.split(RegExp('[\\t\\s]+'));

    // Captures commands with 2 Arguments between 2 Keywords
    let docs: doc_entry | undefined = getCommand(sub_com[0] + ' ' + sub_com[3])
    if (docs) {
        return docs
    } else {
        // Captures AtC commands with 3 Keywords like "fix_modify AtC control localized_lambda"
        docs = getCommand(sub_com[0] + ' AtC ' + sub_com[2] + ' ' + sub_com[3])
        if (docs) {
            return docs
        } else {
            // // Captures AtC commands with 2 Keywords like like "fix_modify AtC output"
            docs = getCommand(sub_com[0] + ' AtC ' + sub_com[2])
            if (docs) {
                return docs
            } else {
                // Captures commands with 1 Arguments between 2 Keywords
                docs = getCommand(sub_com[0] + ' ' + sub_com[2])
                if (docs) {
                    return docs
                } else {
                    // Captures commands with 2 Arguments
                    docs = getCommand(sub_com[0] + ' ' + sub_com[1])
                    if (docs) {
                        return docs
                    } else {
                        // Captures commands with 1 Argument
                        docs = getCommand(sub_com[0])
                        if (docs) {
                            return docs
                        } else {
                            return undefined
                        }
                    }
                }
            }
        }
    }
}

/** Returns the entire documentation entry for a given command.*/
export function getCommand(find_command: string): doc_entry | undefined {
    return command_docs.find(e => e.command.includes(find_command));
}

/** Returns all commands that include a given substring or RegExp */
export function searchCommands(searchString: string | RegExp): string[] {
    const return_array: string[] = []
    command_docs.forEach(element => {
        element.command.forEach(com => {
            if (!(com.search(searchString) == -1)) {
                return_array?.push(com)
            }
        })
    })
    return return_array
}

/** Searches the Syntax of a given command for a particular argument or RegExp
 * and returns the position index of that argument according to the syntax. 
 * Example:    
 * Suppose you want to locate the 'file' argument in the 'bond_write' command
 * with syntax ´bond_write btype N inner outer file keyword itype jtype´  
 * getArgDoc('bond_write',RegExp('\\b(file)\\b')) would return 5  
 * */
export function getArgIndex(command: string, argument: RegExp | string): number {
    const com = getCommand(command)
    let idx: number = -1
    if (com) {
        const args = com.syntax.trim().split(RegExp('\\s+'))
        for (let index = 0; index < args.length; index++) {
            const find_idx = args[index].search(argument)
            if (find_idx != -1) {
                idx = index
                break
            }
        }
    }
    return idx
}

/** Generates Autocompletion SnippetString for CompletionList*/
function generateSnippetString(command_doc: doc_entry): SnippetString {

    let snip = new SnippetString(command_doc.args[0].arg);

    for (let index = 1; index < command_doc.args.length; index++) {
        snip.appendText(" ")
        switch (command_doc.args[index].type) {
            case 1:
                snip.appendText(command_doc.args[index].arg)
                break;
            case 2:
                snip.appendPlaceholder(command_doc.args[index].arg)
                break;
            case 3:
                snip.appendChoice(command_doc.args[index].choices)
                break;
            default:
                break;
        }
    }
    return snip
}

/** Generates CompletionList for all commands*/
export function getCompletionList(autoConf: WorkspaceConfiguration): CompletionList {

    const completion_List = new CompletionList();

    if (autoConf.Setting != "None") {

        for (let c of command_docs.values()) {
            for (let c_ix of c.command.values()) {
                const compl_it = new CompletionItem(c_ix);
                if (autoConf.Setting == 'Minimal') {
                    compl_it.detail = c.syntax
                }
                compl_it.insertText = generateSnippetString(c)
                compl_it.kind = CompletionItemKind.Function
                completion_List.items.push(compl_it)
            }
        }
    }
    return completion_List
}

export async function doc_completion_item(autoConf: WorkspaceConfiguration, compl_it: CompletionItem): Promise<CompletionItem | undefined> {

    function mediumBlock(c: doc_entry, compl_it_doc: MarkdownString): MarkdownString {
        compl_it_doc = docLink(c.html_filename, compl_it_doc)
        compl_it_doc.appendCodeblock(c.syntax, 'lmps')
        compl_it_doc.appendMarkdown(c.parameters)
        return compl_it_doc
    }
    
    function docLink(html_link: string, compl_it_doc: MarkdownString): MarkdownString {
        return compl_it_doc.appendMarkdown("[Open documentation](https://lammps.sandia.gov/doc/" + html_link + ")\n")
    }

    if (autoConf.Setting != "None") {
        const color: string = getColor()
        if (compl_it.label) {
            const c: doc_entry | undefined = getDocumentation(compl_it.label)
            if (c) {
                compl_it.documentation = new MarkdownString("", true);
                switch (autoConf.Setting) {
                    case "Minimal":
                        compl_it.documentation = docLink(c.html_filename, compl_it.documentation)
                        break;
                    case "Medium":
                        compl_it.documentation = mediumBlock(c, compl_it.documentation)
                        break;
                    case "Extensive":
                        compl_it.documentation = mediumBlock(c, compl_it.documentation)
                        compl_it.documentation.appendMarkdown(" \n" + "--- " + " \n")
                        compl_it.documentation.appendMarkdown(await getMathMarkdown(c.short_description, color))
                        break;
                    default:
                        break;
                }
            }
        }
    }
    return compl_it
}