/** The player manual: sections of markdown, with generated blocks marked `<!-- gen:name --> ... <!-- /gen:name -->`. */
export interface ManualSection {
  id: string;
  title: string;
  /** One line for the contents list. */
  about: string;
  /** Markdown, generated blocks already expanded and marked. */
  md: string;
}
export interface Manual { sections: ManualSection[]; markdown: string }
export type Generator = () => string;
