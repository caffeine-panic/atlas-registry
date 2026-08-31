import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  StreamLanguage,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ConfigLanguage } from "./configLanguage";

export type ConfigEditorHandle = {
  focusOffset: (offset: number) => void;
};

type ConfigEditorProps = {
  value: string;
  language: ConfigLanguage;
  disabled: boolean;
  onChange: (value: string) => void;
};

function languageExtension(language: ConfigLanguage): Extension {
  switch (language) {
    case "json":
      return json();
    case "yaml":
      return yaml();
    case "xml":
      return xml();
    case "toml":
      return StreamLanguage.define(toml);
    case "properties":
      return StreamLanguage.define(properties);
    case "plain":
      return [];
  }
}

const editorTheme = EditorView.theme(
  {
    "&": {
      minHeight: "340px",
      color: "#d8e6f3",
      backgroundColor: "#09101a",
      fontSize: "13px",
    },
    ".cm-content": {
      minHeight: "340px",
      padding: "14px 0",
      fontFamily: '"SFMono-Regular", Consolas, monospace',
      lineHeight: "1.65",
    },
    ".cm-gutters": {
      border: "0",
      color: "#607086",
      backgroundColor: "#0c1520",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#172435" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#315982 !important",
    },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

const brightHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword],
    color: "#ff8bd8",
    fontWeight: "600",
  },
  {
    tag: [
      tags.propertyName,
      tags.attributeName,
      tags.labelName,
      tags.variableName,
    ],
    color: "#63dcff",
  },
  {
    tag: [tags.string, tags.attributeValue],
    color: "#ffd580",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "#c9a7ff",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "#78f0bd",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "#8fd49b",
    fontStyle: "italic",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.separator],
    color: "#b9c9da",
  },
  {
    tag: tags.invalid,
    color: "#ff9aa5",
    textDecoration: "underline wavy #ff6b7a",
  },
]);

export const ConfigEditor = forwardRef<ConfigEditorHandle, ConfigEditorProps>(
  function ConfigEditor({ value, language, disabled, onChange }, forwardedRef) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | undefined>(undefined);
    const onChangeRef = useRef(onChange);
    const initialValue = useRef(value);
    const initialLanguage = useRef(language);
    const initialDisabled = useRef(disabled);
    const languageCompartment = useRef(new Compartment());
    const editableCompartment = useRef(new Compartment());
    onChangeRef.current = onChange;

    useImperativeHandle(forwardedRef, () => ({
      focusOffset(offset) {
        const current = view.current;
        if (!current) return;
        const position = Math.max(
          0,
          Math.min(offset, current.state.doc.length),
        );
        current.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: "center" }),
        });
        current.focus();
      },
    }));

    useEffect(() => {
      if (!host.current) return;
      const editor = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: initialValue.current,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            indentOnInput(),
            bracketMatching(),
            highlightActiveLine(),
            syntaxHighlighting(brightHighlightStyle, { fallback: true }),
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              indentWithTab,
            ]),
            EditorView.lineWrapping,
            editorTheme,
            languageCompartment.current.of(
              languageExtension(initialLanguage.current),
            ),
            editableCompartment.current.of(
              EditorView.editable.of(!initialDisabled.current),
            ),
            EditorView.updateListener.of((update) => {
              if (update.docChanged)
                onChangeRef.current(update.state.doc.toString());
            }),
          ],
        }),
      });
      view.current = editor;
      return () => {
        editor.destroy();
        view.current = undefined;
      };
    }, []);

    useEffect(() => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({
        effects: languageCompartment.current.reconfigure(
          languageExtension(language),
        ),
      });
    }, [language]);

    useEffect(() => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({
        effects: editableCompartment.current.reconfigure(
          EditorView.editable.of(!disabled),
        ),
      });
    }, [disabled]);

    useEffect(() => {
      const editor = view.current;
      if (!editor || editor.state.doc.toString() === value) return;
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
    }, [value]);

    return (
      <div
        className={`config-editor ${disabled ? "disabled" : ""}`}
        ref={host}
      />
    );
  },
);
