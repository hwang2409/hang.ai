'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { renderToString as katexRenderToString } from 'katex';

interface ContentEditableEditorProps {
  value: string;
  onChange: (value: string) => void;
  onAutoSave?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ContentEditableEditor({ value, onChange, onAutoSave, placeholder, className = '' }: ContentEditableEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const editingMathNodeRef = useRef<Text | null>(null);
  const mathRenderTimeoutRef = useRef<number | null>(null);

  const escapeHtml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const setEditorFromValue = (val: string) => {
    if (!editorRef.current) return;
    const root = editorRef.current;
    root.innerHTML = '';
    renderMarkdownInto(root, val || '');
  };

  // Insert safe text node
  const appendText = (parent: HTMLElement, text: string) => {
    if (!text) return;
    parent.appendChild(document.createTextNode(text));
  };

  // Render minimal markdown (images + line breaks) into a container
  const renderMarkdownInto = (container: HTMLElement, md: string) => {
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
    const lines = md.split(/\n/);
    lines.forEach((line, idx) => {
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = imageRegex.exec(line)) !== null) {
        const [full, alt, src] = match;
        const start = match.index;
        const before = line.slice(lastIndex, start);
        appendText(container, before);
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.draggable = false;
        img.setAttribute('data-markdown', full);
        img.setAttribute('contenteditable', 'false');
        img.className = 'ce-inline-image';
        container.appendChild(img);
        lastIndex = start + full.length;
      }
      appendText(container, line.slice(lastIndex));
      if (idx < lines.length - 1) {
        container.appendChild(document.createElement('br'));
      }
    });
  };

  // Serialize DOM back to markdown
  const serializeDomToMarkdown = (root: HTMLElement): string => {
    const parts: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    let node: Node | null = walker.currentNode;
    // TreeWalker starts at root; we want its children
    function pushForElement(el: Element) {
      if (el.tagName === 'BR') {
        parts.push('\n');
      } else if (el.tagName === 'IMG') {
        const md = (el as HTMLElement).getAttribute('data-markdown');
        if (md) parts.push(md);
      } else if (el.classList && el.classList.contains('ce-math')) {
        const latex = (el as HTMLElement).getAttribute('data-latex') || '';
        const isBlock = el.classList.contains('ce-math-block');
        parts.push(isBlock ? `$$${latex}$$` : `$${latex}$`);
      }
    }
    // Manually iterate children depth-first
    const traverse = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) {
        parts.push((n as Text).data);
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        pushForElement(el);
        // Do not descend into IMG
        if (el.tagName !== 'IMG') {
          for (let i = 0; i < el.childNodes.length; i++) {
            traverse(el.childNodes[i]);
          }
        }
      }
    };
    for (let i = 0; i < root.childNodes.length; i++) traverse(root.childNodes[i]);
    // Normalize consecutive \n from adjacent BRs
    return parts.join('').replace(/\r\n?/g, '\n');
  };

  // Caret utilities
  const getCaretCharOffset = (root: HTMLElement): number => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  };

  const setCaretCharOffset = (root: HTMLElement, targetOffset: number) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node: Text | null = walker.nextNode() as Text | null;
    let offset = targetOffset;
    while (node) {
      const len = node.data.length;
      if (offset <= len) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, Math.min(offset, len)));
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      offset -= len;
      node = walker.nextNode() as Text | null;
    }
    // Fallback: set at end
    const r = document.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  // Caret marker approach to avoid jumps during DOM transforms
  const CARET_MARK = '\uE000'; // private-use char unlikely to appear
  const insertCaretMarker = (): Text | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const marker = document.createTextNode(CARET_MARK);
    range.insertNode(marker);
    // Move selection after marker
    const r = document.createRange();
    r.setStart(marker, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return marker;
  };

  const restoreCaretFromMarker = (root: HTMLElement, marker: Text | null) => {
    if (!marker) return;
    const sel = window.getSelection();
    const parent = marker.parentNode;
    const offset = marker.data.indexOf(CARET_MARK);
    const before = marker.data.slice(0, offset);
    // Remove marker char, keep remaining text if any
    const remaining = marker.data.replace(CARET_MARK, '');
    if (remaining) {
      marker.data = remaining;
    } else if (parent) {
      parent.removeChild(marker);
    }
    if (sel) {
      const r = document.createRange();
      const targetNode = parent && parent.nodeType === Node.TEXT_NODE ? (parent as unknown as Text) : (marker as Text);
      const len = (targetNode.nodeType === Node.TEXT_NODE ? (targetNode as Text).data.length : 0);
      r.setStart(targetNode, Math.min(len, before.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  // Determine math regions within a text for $...$ and $$...$$ (ignoring escaped $)
  const findMathRegions = (text: string): Array<{ start: number; end: number; display: boolean }> => {
    const regions: Array<{ start: number; end: number; display: boolean }> = [];
    const len = text.length;
    let i = 0;
    const isEscaped = (idx: number) => {
      let backslashes = 0;
      let j = idx - 1;
      while (j >= 0 && text[j] === '\\') {
        backslashes++;
        j--;
      }
      return backslashes % 2 === 1;
    };
    while (i < len) {
      if (text[i] === '$' && !isEscaped(i)) {
        // block $$
        if (i + 1 < len && text[i + 1] === '$' && !isEscaped(i + 1)) {
          const open = i;
          i += 2;
          let close = -1;
          while (i < len) {
            if (text[i] === '$' && !isEscaped(i) && i + 1 < len && text[i + 1] === '$' && !isEscaped(i + 1)) {
              close = i + 2;
              break;
            }
            i++;
          }
          if (close !== -1) {
            regions.push({ start: open, end: close, display: true });
            i = close;
            continue;
          }
          // unmatched; stop searching
          break;
        } else {
          // inline $
          const open = i;
          i += 1;
          let close = -1;
          while (i < len) {
            if (text[i] === '$' && !isEscaped(i)) {
              close = i + 1;
              break;
            }
            i++;
          }
          if (close !== -1) {
            regions.push({ start: open, end: close, display: false });
            i = close;
            continue;
          }
          // unmatched; stop searching
          break;
        }
      }
      i++;
    }
    return regions;
  };

  // Replace image markdown patterns in place without rebuilding the whole DOM
  const convertImagesInPlace = (root: HTMLElement) => {
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toProcess: Text[] = [];
    let textNode: Text | null;
    // Collect first to avoid live DOM mutation during traversal affecting walker
    while ((textNode = walker.nextNode() as Text | null)) {
      if (textNode && imageRegex.test(textNode.data)) {
        toProcess.push(textNode);
      }
      imageRegex.lastIndex = 0;
    }
    toProcess.forEach(node => {
      const parent = node.parentElement as HTMLElement;
      if (!parent) return;
      const text = node.data;
      let lastIndex = 0;
      const frag = document.createDocumentFragment();
      let match: RegExpExecArray | null;
      while ((match = imageRegex.exec(text)) !== null) {
        const [full, alt, src] = match;
        const start = match.index;
        const before = text.slice(lastIndex, start);
        if (before) frag.appendChild(document.createTextNode(before));
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.draggable = false;
        img.setAttribute('data-markdown', full);
        img.setAttribute('contenteditable', 'false');
        img.className = 'ce-inline-image';
        frag.appendChild(img);
        lastIndex = start + full.length;
      }
      const after = text.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, node);
    });
  };

  // Replace LaTeX $...$ (inline) and $$...$$ (block) with KaTeX-rendered, non-editable elements
  const convertMathInPlace = (root: HTMLElement) => {
    const inlineRe = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g; // $...$ not escaped
    const blockRe = /(?<!\\)\$\$([^$]+?)(?<!\\)\$\$/g;   // $$...$$ within same text node, not escaped

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toProcess: Text[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      // Skip the raw math node currently being edited
      if (editingMathNodeRef.current && textNode === editingMathNodeRef.current) {
        continue;
      }
      const data = textNode?.data || '';
      if (!data) continue;
      if (inlineRe.test(data) || blockRe.test(data)) {
        toProcess.push(textNode);
      }
      inlineRe.lastIndex = 0;
      blockRe.lastIndex = 0;
    }

    const renderMath = (latex: string, displayMode: boolean) => {
      try {
        const html = katexRenderToString(latex, { displayMode, throwOnError: false, output: 'html' });
        const wrapper = document.createElement(displayMode ? 'div' : 'span');
        wrapper.className = displayMode ? 'ce-math ce-math-block ktx' : 'ce-math ce-math-inline ktx';
        wrapper.setAttribute('data-latex', latex);
        wrapper.setAttribute('contenteditable', 'false');
        wrapper.innerHTML = html;
        return wrapper;
      } catch {
        return document.createTextNode(displayMode ? `$$${latex}$$` : `$${latex}$`);
      }
    };

    toProcess.forEach(node => {
      const parent = node.parentElement as HTMLElement;
      if (!parent) return;
      const text = node.data;
      let lastIndex = 0;
      const frag = document.createDocumentFragment();

      // Replace block math first
      let m: RegExpExecArray | null;
      blockRe.lastIndex = 0;
      const segments: Array<string | { type: 'block' | 'inline'; latex: string }> = [];

      // Split text into non-overlapping sequence of plain and math tokens
      let idx = 0;
      while (idx < text.length) {
        blockRe.lastIndex = idx;
        inlineRe.lastIndex = idx;
        const bm = blockRe.exec(text);
        const im = inlineRe.exec(text);
        let next: { kind: 'block' | 'inline'; start: number; end: number; latex: string } | null = null;
        if (bm && (!im || bm.index <= im.index)) {
          next = { kind: 'block', start: bm.index, end: bm.index + bm[0].length, latex: bm[1] };
        } else if (im) {
          next = { kind: 'inline', start: im.index, end: im.index + im[0].length, latex: im[1] };
        }
        if (!next) {
          segments.push(text.slice(idx));
          break;
        }
        if (next.start > idx) {
          segments.push(text.slice(idx, next.start));
        }
        segments.push({ type: next.kind === 'block' ? 'block' : 'inline', latex: next.latex });
        idx = next.end;
      }

      segments.forEach(seg => {
        if (typeof seg === 'string') {
          if (seg) frag.appendChild(document.createTextNode(seg));
        } else {
          const el = renderMath(seg.latex, seg.type === 'block');
          frag.appendChild(el);
          // For block math, ensure a line break after for separation
          if (seg.type === 'block') {
            frag.appendChild(document.createElement('br'));
          }
        }
      });

      parent.replaceChild(frag, node);
    });
  };

  // Highlight image when caret is one delete away (immediately before an <img>)
  // Also: if caret is immediately before a rendered math element, reveal it back to raw markdown for editing
  const updateDeletionFocusHighlight = (root: HTMLElement) => {
    // Remove existing highlights
    root.querySelectorAll('img.ce-inline-image.ce-deletion-focus').forEach(el => {
      el.classList.remove('ce-deletion-focus');
    });

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let container: Node = range.startContainer;
    let offset: number = range.startOffset;

    // If selection is inside root?
    if (!(root === container || root.contains(container))) return;

    const findNextSiblingNode = (node: Node, off: number): Node | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node as Text).data;
        if (off < text.length) return null; // caret not at end; not immediately before image
        const parent = node.parentNode;
        if (!parent) return null;
        const idx = Array.prototype.indexOf.call(parent.childNodes, node);
        if (idx >= parent.childNodes.length - 1) return parent; // climb up to evaluate next in ancestor chain
        return parent.childNodes[idx + 1];
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        // If we have a next child at current offset
        return el.childNodes[off] || el;
      }
      return null;
    };

    const findPrevSiblingNode = (node: Node, off: number): Node | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (off > 0) return null; // caret not at start
        const parent = node.parentNode;
        if (!parent) return null;
        const idx = Array.prototype.indexOf.call(parent.childNodes, node);
        if (idx <= 0) return parent;
        return parent.childNodes[idx - 1];
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (off <= 0) return el;
        return el.childNodes[off - 1] || el;
      }
      return null;
    };

    let probe: Node | null = findNextSiblingNode(container, offset);
    // Walk down to first meaningful descendant if we landed on a container
    const descendToFirst = (n: Node | null): Node | null => {
      while (n && n.nodeType === Node.ELEMENT_NODE && (n as Element).childNodes.length > 0) {
        n = (n as Element).childNodes[0];
      }
      return n;
    };
    if (probe && probe.nodeType === Node.ELEMENT_NODE) {
      probe = descendToFirst(probe);
    }
    // Skip leading BRs and whitespace-only text nodes
    while (probe && ((probe.nodeType === Node.ELEMENT_NODE && (probe as Element).tagName === 'BR') ||
      (probe.nodeType === Node.TEXT_NODE && !(probe as Text).data.trim()))) {
      const next = (probe.parentNode && probe.parentNode.childNodes)
        ? (probe.parentNode.childNodes[Array.prototype.indexOf.call(probe.parentNode.childNodes, probe) + 1] || null)
        : null;
      probe = next;
    }

    if (probe && probe.nodeType === Node.ELEMENT_NODE) {
      const el = probe as Element;
      if (el.tagName === 'IMG' && el.classList.contains('ce-inline-image')) {
        el.classList.add('ce-deletion-focus');
      } else if (el.classList && el.classList.contains('ce-math')) {
        // Reveal math node into raw markdown so user can edit
        const latex = (el as HTMLElement).getAttribute('data-latex') || '';
        const isBlock = el.classList.contains('ce-math-block');
        const md = isBlock ? `$$${latex}$$` : `$${latex}$`;
        const textNode = document.createTextNode(md);
        const parent = el.parentNode;
        if (parent) {
          const sel = window.getSelection();
          parent.replaceChild(textNode, el);
          // Keep caret before revealed text (one delete away)
          if (sel) {
            const r = document.createRange();
            r.setStart(textNode, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          }
          // Mark this node as currently editing; suppress KaTeX conversion until caret leaves
          editingMathNodeRef.current = textNode;
        }
      }
    }

    // Also reveal when caret is immediately AFTER a math element (one Backspace away)
    let prevProbe: Node | null = findPrevSiblingNode(container, offset);
    // Normalize previous meaningful
    while (
      prevProbe &&
      ((prevProbe.nodeType === Node.ELEMENT_NODE && (prevProbe as Element).tagName === 'BR') ||
        (prevProbe.nodeType === Node.TEXT_NODE && !(prevProbe as Text).data.trim()))
    ) {
      const prev =
        prevProbe.parentNode && prevProbe.parentNode.childNodes
          ? prevProbe.parentNode.childNodes[
              Math.max(0, Array.prototype.indexOf.call(prevProbe.parentNode.childNodes, prevProbe) - 1)
            ] || null
          : null;
      prevProbe = prev;
    }
    if (prevProbe && prevProbe.nodeType === Node.ELEMENT_NODE) {
      const el = prevProbe as Element;
      if (el.classList && el.classList.contains('ce-math')) {
        const latex = (el as HTMLElement).getAttribute('data-latex') || '';
        const isBlock = el.classList.contains('ce-math-block');
        const md = isBlock ? `$$${latex}$$` : `$${latex}$`;
        const textNode = document.createTextNode(md);
        const parent = el.parentNode;
        if (parent) {
          const sel = window.getSelection();
          parent.replaceChild(textNode, el);
          // Place caret at end of revealed text (one Backspace away)
          if (sel) {
            const r = document.createRange();
            r.setStart(textNode, textNode.data.length);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          }
          editingMathNodeRef.current = textNode;
        }
      }
    }
  };

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Auto-save function with debouncing
  const debouncedAutoSave = useCallback((newValue: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      if (onAutoSave && newValue !== value) {
        setIsSaving(true);
        try {
          await onAutoSave(newValue);
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setIsSaving(false);
        }
      }
    }, 1000);
  }, [onAutoSave, value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value);
    setTimeout(() => {
      if (editorRef.current) {
        // Initialize DOM content once when entering edit mode (preserve newlines)
        setEditorFromValue(value || '');
        editorRef.current.focus();
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
        // Initial highlight state
        updateDeletionFocusHighlight(editorRef.current);
      }
    }, 0);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    
    // Prevent RTL input by ensuring LTR direction
    if (e.currentTarget.style.direction !== 'ltr') {
      e.currentTarget.style.direction = 'ltr';
    }

    // Handle Enter to insert <br> and move caret to new line
    if (e.key === 'Enter') {
      e.preventDefault();
      const el = e.currentTarget as HTMLDivElement;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      // Remove selection if any
      range.deleteContents();
      const br = document.createElement('br');
      range.insertNode(br);
      // After <br>, also ensure there's a text node to place caret into
      const textNode = document.createTextNode('');
      br.parentNode?.insertBefore(textNode, br.nextSibling);
      // Move caret after the inserted nodes
      const newRange = document.createRange();
      newRange.setStart(textNode, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      // Update state to reflect newline
      const markdownNow = serializeDomToMarkdown(el);
      setEditValue(markdownNow);
      onChange(markdownNow);
      debouncedAutoSave(markdownNow);
      // Update deletion highlight position after newline
      updateDeletionFocusHighlight(el);
      lastKeyRef.current = 'Enter';
      return;
    }

    // Record Backspace so we can avoid forced caret restoration on input
    if (e.key === 'Backspace') {
      lastKeyRef.current = 'Backspace';
    } else {
      lastKeyRef.current = e.key;
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget as HTMLDivElement;
    const lastKey = lastKeyRef.current;
    // If we are editing a raw math node or caret is inside a math region, avoid any DOM transforms/markers
    const sel = window.getSelection();
    const activeText = sel && sel.rangeCount > 0 && sel.getRangeAt(0).startContainer.nodeType === Node.TEXT_NODE
      ? (sel.getRangeAt(0).startContainer as Text)
      : null;
    const caretInsideMath = (() => {
      if (!activeText) return false;
      const regions = findMathRegions(activeText.data);
      const idx = sel!.getRangeAt(0).startOffset;
      return regions.some(r => idx > r.start && idx < r.end);
    })();
    const skipTransforms = Boolean(editingMathNodeRef.current) || caretInsideMath;

    const marker = skipTransforms || lastKey === 'Backspace' ? null : insertCaretMarker();
    // Convert only image syntax in place
    if (!skipTransforms) {
      convertImagesInPlace(el);
    }
    // Defer LaTeX conversion to avoid mid-typing flicker
    if (mathRenderTimeoutRef.current) {
      window.clearTimeout(mathRenderTimeoutRef.current);
      mathRenderTimeoutRef.current = null;
    }
    if (!skipTransforms) {
      mathRenderTimeoutRef.current = window.setTimeout(() => {
        // Avoid converting while user is typing a delimiter or escape
        if (lastKeyRef.current === '$' || lastKeyRef.current === '\\') return;
        const selNow = window.getSelection();
        if (selNow && selNow.rangeCount > 0) {
          const container = selNow.getRangeAt(0).startContainer;
          const textNode = container.nodeType === Node.TEXT_NODE ? (container as Text) : null;
          if (textNode) {
            const regions = findMathRegions(textNode.data);
            const caretIndex = selNow.getRangeAt(0).startOffset;
            const inside = regions.some(r => caretIndex > r.start && caretIndex < r.end);
            if (inside) return; // caret inside math; do not render
          }
        }
        if (editorRef.current && !editingMathNodeRef.current) {
          convertMathInPlace(editorRef.current);
        }
      }, 300);
    }
    // Restore caret to marker
    if (marker) restoreCaretFromMarker(el, marker);
    // Update highlight state based on caret
    updateDeletionFocusHighlight(el);
    // Serialize to markdown for state/persistence
    const markdownNow = serializeDomToMarkdown(el);
    if (!skipTransforms) {
      onChange(markdownNow);
      debouncedAutoSave(markdownNow);
    }
    // Reset last key flag so future inputs restore normally
    lastKeyRef.current = null;
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    const el = editorRef.current;
    if (!el) return;
    // Update highlight after navigation or edit keys
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Delete' ||
      e.key.length === 1 // character keys
    ) {
      updateDeletionFocusHighlight(el);
    }

    // If caret moved out of the raw math node, clear editing state
    if (editingMathNodeRef.current) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const anchor = sel.getRangeAt(0).startContainer;
        if (anchor !== editingMathNodeRef.current) {
          editingMathNodeRef.current = null;
          // After leaving math, schedule a render
          if (mathRenderTimeoutRef.current) {
            window.clearTimeout(mathRenderTimeoutRef.current);
          }
          mathRenderTimeoutRef.current = window.setTimeout(() => {
            if (editorRef.current) convertMathInPlace(editorRef.current);
          }, 150);
          // Now that we've left math, propagate state and autosave
          if (editorRef.current) {
            const md = serializeDomToMarkdown(editorRef.current);
            setEditValue(md);
            onChange(md);
            debouncedAutoSave(md);
          }
        }
      }
    }
  };

  const handleMouseUp = () => {
    const el = editorRef.current;
    if (!el) return;
    updateDeletionFocusHighlight(el);

    // Clear editing state if caret left the raw math node
    if (editingMathNodeRef.current) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const anchor = sel.getRangeAt(0).startContainer;
        if (anchor !== editingMathNodeRef.current) {
          editingMathNodeRef.current = null;
          if (mathRenderTimeoutRef.current) {
            window.clearTimeout(mathRenderTimeoutRef.current);
          }
          mathRenderTimeoutRef.current = window.setTimeout(() => {
            if (editorRef.current) convertMathInPlace(editorRef.current);
          }, 150);
          if (editorRef.current) {
            const md = serializeDomToMarkdown(editorRef.current);
            setEditValue(md);
            onChange(md);
            debouncedAutoSave(md);
          }
        }
      }
    }
  };

  const handleFocus = () => {
    const el = editorRef.current;
    if (!el) return;
    updateDeletionFocusHighlight(el);
  };

  // Sync from external value only when not editing
  useEffect(() => {
    if (editorRef.current && !isEditing) {
      setEditorFromValue(value || '');
    }
  }, [value, isEditing]);

  // Ensure LTR direction when editing starts
  useEffect(() => {
    if (editorRef.current && isEditing) {
      editorRef.current.style.direction = 'ltr';
      editorRef.current.style.textAlign = 'left';
    }
  }, [isEditing]);

  // Simple markdown rendering for contentEditable
  const renderMarkdownInPlace = (text: string) => {
    if (!text.trim()) return text;
    
    // Handle images
    let processed = text.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
      return `🖼️ ${alt}`;
    });
    
    // Handle headers
    processed = processed.replace(/^#{1,6}\s(.+)$/gm, (match, content) => {
      const level = match.match(/^(#{1,6})/)?.[1].length || 1;
      return `📝 ${content}`;
    });
    
    // Handle bold
    processed = processed.replace(/\*\*(.*?)\*\*/g, '**$1**');
    
    // Handle italic
    processed = processed.replace(/\*(.*?)\*/g, '*$1*');
    
    // Handle code
    processed = processed.replace(/`(.*?)`/g, '`$1`');
    
    return processed;
  };

  return (
    <div className={`content-editable-editor ${className}`}>
      {isEditing ? (
        <div className="editor-mode">
          <div className="editor-toolbar">
            <span className="editor-hint">
              {isSaving ? 'Saving...' : 'Auto-saves as you type • Press Esc to cancel'}
            </span>
            <div className="editor-actions">
              <button 
                className="editor-cancel-btn"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </div>
          <div 
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onMouseUp={handleMouseUp}
            onFocus={handleFocus}
            className="content-editable-area"
            suppressContentEditableWarning={true}
            data-placeholder={placeholder || 'Start writing...'}
            dir="ltr"
            style={{ direction: 'ltr', textAlign: 'left' }}
          >
          </div>
        </div>
      ) : (
        <div 
          className="preview-mode"
          onClick={handleEdit}
        >
          {value.trim() ? (
            <div className="markdown-preview">
              {value.split('\n').map((line, index) => {
                // Handle images
                if (line.match(/!\[.*?\]\(.*?\)/)) {
                  const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
                  if (imageMatch) {
                    const [, alt, src] = imageMatch;
                    return (
                      <div key={index} className="preview-image-container">
                        <img src={src} alt={alt} className="preview-image" />
                      </div>
                    );
                  }
                }
                
                // Handle headers
                if (line.match(/^#{1,6}\s/)) {
                  const level = line.match(/^(#{1,6})/)?.[1].length || 1;
                  const content = line.replace(/^#{1,6}\s/, '');
                  return (
                    <div key={index} className={`preview-h${level}`}>
                      {content}
                    </div>
                  );
                }
                
                // Handle regular text
                return (
                  <div key={index} className="preview-text">
                    {line || '\u00A0'}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="editor-placeholder">
              {placeholder || 'Click to start writing...'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
