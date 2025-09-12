'use client';

import React, { useEffect, useRef } from 'react';
import { EditorView, keymap, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { history, historyKeymap } from '@codemirror/commands';
import { tags as t } from '@lezer/highlight';
import katex from 'katex';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onAutoSave?: (value: string) => void;
  className?: string;
  placeholder?: string;
  token?: string | null;
};

// Decoration logic: render math and images when safe (caret not inside)
const richDecorField = StateField.define<DecorationSet>({
  create(state) {
    return decorateDoc(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) {
      return decorateDoc(tr.state);
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f)
});

function decorateDoc(state: EditorState): DecorationSet {
  const builder: RangeBuilder = new RangeBuilder();
  const sel = state.selection.main;
  const doc = state.doc.toString();

  // Helper: treat caret inside OR exactly at boundaries as an edit-intent → keep raw
  // Images should always stay rendered, but checklists can revert to raw when editing
  const shouldKeepRaw = (from: number, to: number, pos: number, type?: string) => {
    // Always keep images rendered, never revert to raw markdown
    if (type === 'image') {
      return false;
    }
    // Checklists can revert to raw markdown when editing
    return pos > from && pos < to || pos === from || pos === to;
  };

  // Scan single line regions for simplicity (robust enough for inline typing)
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const text = line.text;

    // Checklists: - [ ] or - [x] (process FIRST to override other parsing)
    const checklistRe = /^(\s*)- \[([ x])\](.*)$/;
    const checklistMatch = text.match(checklistRe);
    if (checklistMatch) {
      const full = checklistMatch[0];
      const indent = checklistMatch[1];
      const checked = checklistMatch[2] === 'x';
      const content = checklistMatch[3];
      const from = line.from;
      const to = line.to;
      if (!shouldKeepRaw(from, to, sel.from, 'checklist')) {
        // Replace the entire line with the checklist widget
        const deco = Decoration.replace({ 
          widget: new ChecklistWidget(indent, checked, content, from, to), 
          inclusive: false,
          block: false
        });
        builder.add(from, to, deco);
        continue; // Skip other parsing for this line
      }
    }

    // Hide heading markers (leading #... + space) entirely with zero-width widget
    const headingMatch = text.match(/^(#{1,6})(\s+)/);
    if (headingMatch) {
      const markerLen = headingMatch[1].length + headingMatch[2].length;
      builder.add(line.from, line.from + markerLen, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
    }

    // Blockquote: hide leading '> '
    const bqMatch = text.match(/^(>\s+)/);
    if (bqMatch) {
      const markerLen = bqMatch[1].length;
      builder.add(line.from, line.from + markerLen, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
    }

    // Unordered list: hide '-', '*', '+' markers and a following space; render a bullet instead
    const ulMatch = text.match(/^(\s*)([-*+])\s+/);
    if (ulMatch) {
      const markerLen = ulMatch[0].length;
      builder.addWidget(line.from, Decoration.widget({ widget: new (class extends WidgetType { toDOM(){ const span=document.createElement('span'); span.className='cm-bullet'; span.textContent='•\u00A0'; return span; } })(), side: -1 }));
      builder.add(line.from, line.from + markerLen, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
    }

    // Ordered list: hide '1. ' etc; render number + space
    const olMatch = text.match(/^(\s*)(\d+)\.\s+/);
    if (olMatch) {
      const markerLen = olMatch[0].length;
      const n = olMatch[2];
      builder.addWidget(line.from, Decoration.widget({ widget: new (class extends WidgetType { constructor(private n:string){ super(); } toDOM(){ const span=document.createElement('span'); span.className='cm-olist'; span.textContent=this.n+'.\u00A0'; return span; } })(n), side: -1 }));
      builder.add(line.from, line.from + markerLen, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
    }

    // Parse for $$...$$ first
    scanMath(text, true, (a, b) => {
      const from = line.from + a;
      const to = line.from + b;
      if (shouldKeepRaw(from, to, sel.from)) return; // caret at/inside: keep raw
      const latex = text.slice(a + 2, b - 2);
      const html = katex.renderToString(latex, { displayMode: true, throwOnError: false });
      const deco = Decoration.replace({ widget: new HtmlWidget(html, true), inclusive: false, block: true });
      builder.add(from, to, deco);
    });

    // Then $...$
    scanMath(text, false, (a, b) => {
      const from = line.from + a;
      const to = line.from + b;
      if (shouldKeepRaw(from, to, sel.from)) return;
      const latex = text.slice(a + 1, b - 1);
      const html = katex.renderToString(latex, { displayMode: false, throwOnError: false });
      const deco = Decoration.replace({ widget: new HtmlWidget(html, false), inclusive: false });
      builder.add(from, to, deco);
    });

    // Images: ![alt](src) or ![alt](src)<!--pos:{...}--> or ![alt](src)<!--inline--> or ![alt](src)<!--size:{...}-->
    const imgRe = /!\[(.*?)\]\((.*?)\)(?:<!--(pos|inline|size):(.*?)-->)*/g;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(text))) {
      const full = m[0];
      const alt = m[1];
      const src = m[2];
      const from = line.from + m.index;
      const to = from + full.length;
      
      // Parse all comment types from the full match
      let positioning = null;
      let isInline = false;
      let sizeData = null;
      
      // Extract all comment types
      const commentMatches = full.match(/<!--(pos|inline|size):(.*?)-->/g);
      if (commentMatches) {
        commentMatches.forEach(comment => {
          const match = comment.match(/<!--(pos|inline|size):(.*?)-->/);
          if (match) {
            const type = match[1];
            const data = match[2];
            
            try {
              const parsedData = JSON.parse(data);
              
              if (type === 'pos') {
                positioning = parsedData;
              } else if (type === 'inline') {
                isInline = true;
                positioning = parsedData;
              } else if (type === 'size') {
                sizeData = parsedData;
              }
            } catch (e) {
              // Ignore invalid data
            }
          }
        });
      }
      
      // All images are now inline - always render as widget, never show raw markdown
      const deco = Decoration.replace({ widget: new ImageWidget(src, alt, positioning, true, sizeData), inclusive: false });
      builder.add(from, to, deco);
    }


    // Bold: **text**
    const boldRe = /\*\*(.+?)\*\*/g;
    let bm: RegExpExecArray | null;
    while ((bm = boldRe.exec(text))) {
      const matchStart = line.from + bm.index;
      const matchEnd = matchStart + bm[0].length;
      if (shouldKeepRaw(matchStart, matchEnd, sel.from)) continue;
      const innerFrom = matchStart + 2;
      const innerTo = matchEnd - 2;
      if (innerFrom < innerTo) {
        builder.add(innerFrom, innerTo, Decoration.mark({ class: 'cm-strong' }));
        // hide markers
        builder.add(matchStart, matchStart + 2, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
        builder.add(matchEnd - 2, matchEnd, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
      }
    }

    // Italic: *text* (avoid conflict with ** already handled)
    const italicRe = /(^|[^*])\*(?!\*)([^\n*]+?)\*(?!\*)/g;
    let im: RegExpExecArray | null;
    while ((im = italicRe.exec(text))) {
      const offset = im.index + (im[1] ? im[1].length : 0);
      const matchStart = line.from + offset;
      const matchEnd = matchStart + im[0].length - (im[1] ? im[1].length : 0);
      if (shouldKeepRaw(matchStart, matchEnd, sel.from)) continue;
      const innerFrom = matchStart + 1;
      const innerTo = matchEnd - 1;
      if (innerFrom < innerTo) {
        builder.add(innerFrom, innerTo, Decoration.mark({ class: 'cm-em' }));
        builder.add(matchStart, matchStart + 1, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
        builder.add(matchEnd - 1, matchEnd, Decoration.replace({ widget: new (class extends WidgetType { toDOM(){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='0'; s.style.overflow='hidden'; s.setAttribute('aria-hidden','true'); return s; } })(), inclusive: false }));
      }
    }
  }

  return builder.finish();
}

type RangeBuilder = {
  add: (from: number, to: number, deco: any) => void;
  addWidget: (at: number, deco: any) => void;
  finish: () => DecorationSet;
};

function RangeBuilder(): RangeBuilder {
  const ranges: any[] = [];
  return {
    add(from, to, deco) {
      ranges.push(deco.range(from, to));
    },
    addWidget(at, deco) {
      ranges.push(deco.range(at));
    },
    finish() {
      return Decoration.set(ranges.sort((a, b) => a.from - b.from));
    }
  };
}

function scanMath(text: string, block: boolean, onMatch: (from: number, to: number) => void) {
  const open = block ? '$$' : '$';
  const close = open;
  let i = 0;
  const isEsc = (idx: number) => {
    let k = idx - 1, c = 0;
    while (k >= 0 && text[k] === '\\') { c++; k--; }
    return c % 2 === 1;
  };
  while (i < text.length) {
    if (text.startsWith(open, i) && !isEsc(i)) {
      // For inline $, ensure not starting a $$ block
      if (!block && text.startsWith('$$', i)) { i += 1; continue; }
      const start = i;
      i += open.length;
      while (i < text.length) {
        if (text.startsWith(close, i) && !isEsc(i)) {
          // For inline $, ensure closing is not part of $$
          if (!block && text.startsWith('$$', i)) { i += 1; continue; }
          const end = i + close.length;
          onMatch(start, end);
          i = end;
          break;
        }
        i++;
      }
    } else {
      i++;
    }
  }
}

class HtmlWidget extends WidgetType {
  constructor(private html: string, private block: boolean) { super(); }
  toDOM() {
    const wrapper = document.createElement(this.block ? 'div' : 'span');
    wrapper.className = this.block ? 'cm-math cm-math-block' : 'cm-math cm-math-inline';
    wrapper.innerHTML = this.html;
    return wrapper;
  }
}

// Global function to save image positioning to markdown content
function saveImagePositioning(img: HTMLImageElement, src: string, alt: string, alignment: string, offset: number) {
  // Find the editor view by looking for the closest CodeMirror editor
  const editorElement = img.closest('.cm-editor');
  if (!editorElement) return;
  
  // Get the editor view from the global reference
  const editorView = (window as any).currentEditorView;
  if (!editorView) return;
  
  // Get current content
  const currentContent = editorView.state.doc.toString();
  
  // Create positioning data
  const positioningData = {
    alignment,
    offset,
    timestamp: Date.now()
  };
  
  // Create a custom markdown format with positioning data
  const tag = alignment === 'inline' || alignment === 'block' ? 'inline' : 'pos';
  const positionedMarkdown = `![${alt}](${src})<!--${tag}:${JSON.stringify(positioningData)}-->`;
  
  // Find and replace the original image markdown (handle both with and without existing positioning)
  const originalMarkdown = `![${alt}](${src})`;
  const existingPositionedMarkdown = new RegExp(`!\\[${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\(${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)<!--(?:pos|inline):.*?-->`, 'g');
  
  let newContent = currentContent;
  if (existingPositionedMarkdown.test(currentContent)) {
    newContent = currentContent.replace(existingPositionedMarkdown, positionedMarkdown);
  } else {
    newContent = currentContent.replace(originalMarkdown, positionedMarkdown);
  }
  
  // Update the editor content
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: newContent
    }
  });
}

// Global function to show alignment menu
function showAlignmentMenu(event: MouseEvent, img: HTMLImageElement, src: string, alt: string) {
  // Remove any existing menu
  const existingMenu = document.querySelector('.image-alignment-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const menu = document.createElement('div');
  menu.className = 'image-alignment-menu';
  menu.style.position = 'fixed';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.zIndex = '1000';
  menu.style.background = 'var(--card-bg)';
  menu.style.border = '1px solid var(--card-border)';
  menu.style.borderRadius = '0.5rem';
  menu.style.boxShadow = 'var(--shadow-lg)';
  menu.style.padding = '0.5rem';
  menu.style.display = 'flex';
  menu.style.gap = '0.25rem';

  const alignments = [
    { name: 'Left', icon: '⬅️', value: 'left' },
    { name: 'Center', icon: '↔️', value: 'center' },
    { name: 'Right', icon: '➡️', value: 'right' }
  ];
  

  alignments.forEach(alignment => {
    const button = document.createElement('button');
    button.innerHTML = `${alignment.icon} ${alignment.name}`;
    button.style.padding = '0.5rem';
    button.style.border = 'none';
    button.style.borderRadius = '0.25rem';
    button.style.background = 'transparent';
    button.style.cursor = 'pointer';
    button.style.fontSize = '0.875rem';
    button.style.transition = 'background-color 0.2s';
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'var(--card-hover)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });
    
    button.addEventListener('click', () => {
      // Update the image alignment
      const span = img.parentElement;
      if (span) {
        span.style.textAlign = alignment.value;
        img.style.margin = alignment.value === 'center' ? '0 auto' : 
                          alignment.value === 'left' ? '0 auto 0 0' : '0 0 0 auto';
        
        // Save the positioning to the markdown content
        saveImagePositioning(img, src, alt, alignment.value, 0);
      }
      menu.remove();
    });
    
    menu.appendChild(button);
  });

  document.body.appendChild(menu);

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

class ImageWidget extends WidgetType {
  constructor(private src: string, private alt: string, private positioning?: any, private isInline: boolean = false, private sizeData?: any) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-image-inline draggable-image';
    
    // All images are now inline - flows with text, allows text to wrap around full height
    span.style.display = 'inline-block';
    span.style.verticalAlign = 'top';
    span.style.margin = '0 8px';
    span.style.position = 'relative';
    span.style.cursor = 'move';
    span.style.float = 'left';
    
    const img = document.createElement('img');
    // Ensure image URLs point to the backend server
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000';
    img.src = this.src.startsWith('http') ? this.src : `${baseUrl}${this.src}`;
    img.alt = this.alt;
    img.draggable = true;
    
    // Center and constrain image size
    img.style.display = 'block';
    // Apply saved size if available, otherwise use default sizing
    if (this.sizeData && this.sizeData.width && this.sizeData.height) {
      img.style.width = `${this.sizeData.width}px`;
      img.style.height = `${this.sizeData.height}px`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
    } else {
      // Default sizing
      img.style.width = 'auto';
      img.style.maxWidth = '85%';
      img.style.height = 'auto';
      img.style.maxHeight = '520px';
    }
    
    img.style.margin = '0';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '0';
    img.style.boxShadow = 'var(--shadow)';
    img.style.transition = 'transform 0.2s ease';
    
    // Apply saved positioning if available
    if (this.positioning) {
      if (this.positioning.offset !== undefined && this.positioning.offset !== 0) {
        // Apply custom horizontal offset
        span.style.marginLeft = `${this.positioning.offset}px`;
        span.style.marginRight = 'auto';
        span.style.textAlign = 'left';
      } else if (this.positioning.alignment) {
        // Apply alignment (left, center, right)
        span.style.textAlign = this.positioning.alignment;
        img.style.margin = this.positioning.alignment === 'center' ? '0 auto' : 
                          this.positioning.alignment === 'left' ? '0 auto 0 0' : '0 0 0 auto';
      }
    }
    
    // Add mouse-based dragging for positioning (both horizontal and vertical)
    let isMouseDragging = false;
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let originalPosition = { from: 0, to: 0 };
    let lastVerticalMove = 0;
    
    img.addEventListener('mousedown', (e) => {
      // Only start mouse dragging on left click, not right click
      if (e.button === 0) {
        isMouseDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        lastVerticalMove = 0;
        
        // Get current offset
        startOffset = parseFloat(span.style.marginLeft) || 0;
        
        // Store original position in document
        const editorView = (window as any).currentEditorView;
        if (editorView) {
          originalPosition = this.findImageRange(editorView, this.src, this.alt) || { from: 0, to: 0 };
        }
        
        span.classList.add('mouse-dragging');
        img.style.cursor = 'grabbing';
        img.style.userSelect = 'none';
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isMouseDragging) {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        // Handle horizontal positioning
        const newOffset = startOffset + deltaX;
        const maxOffset = window.innerWidth * 0.3;
        const constrainedOffset = Math.max(-maxOffset, Math.min(maxOffset, newOffset));
        
        // Apply horizontal positioning
        span.style.marginLeft = `${constrainedOffset}px`;
        span.style.marginRight = 'auto';
        span.style.textAlign = 'left';
        
        // Handle vertical positioning - move image to new line if dragged up/down significantly
        const verticalThreshold = 20; // Pixels to move before triggering line change
        if (Math.abs(deltaY - lastVerticalMove) > verticalThreshold) {
          this.moveImageVertically(deltaY, originalPosition);
          lastVerticalMove = deltaY;
        }
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isMouseDragging) {
        isMouseDragging = false;
        span.classList.remove('mouse-dragging');
        img.style.cursor = 'move';
        document.body.style.userSelect = '';
        
        // Save the final position
        const finalOffset = parseFloat(span.style.marginLeft) || 0;
        saveImagePositioning(img, this.src, this.alt, 'inline', finalOffset);
      }
    });
    
    // Add HTML5 drag event listeners for repositioning in content
    let isHtml5Dragging = false;
    
    img.addEventListener('dragstart', (e) => {
      isHtml5Dragging = true;
      img.style.opacity = '0.5';
      img.style.transform = 'scale(1.05)';
      
      // Store the image data for the drop
      e.dataTransfer?.setData('text/plain', `![${this.alt}](${this.src})`);
      e.dataTransfer?.setData('application/x-image', JSON.stringify({
        src: this.src,
        alt: this.alt,
        markdown: `![${this.alt}](${this.src})`
      }));
    });
    
    img.addEventListener('dragend', () => {
      isHtml5Dragging = false;
      img.style.opacity = '1';
      img.style.transform = 'scale(1)';
    });
    
    img.addEventListener('dragenter', (e) => {
      e.preventDefault();
      img.style.transform = 'scale(1.05)';
    });
    
    img.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    img.addEventListener('dragleave', () => {
      if (!isHtml5Dragging) {
        img.style.transform = 'scale(1)';
      }
    });
    
    // Add click handler for alignment options
    img.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showAlignmentMenu(e, img, this.src, this.alt);
    });
    
    span.appendChild(img);
    
    // Add clickable areas for text insertion
    this.addClickableAreas(span, img);
    
    // Add resize handles
    this.addResizeHandles(span, img);
    
    return span;
  }
  
  private addClickableAreas(span: HTMLElement, img: HTMLImageElement) {
    // Create invisible clickable areas around the image
    const createClickArea = (position: 'before' | 'after') => {
      const area = document.createElement('span');
      area.className = `image-click-area image-click-${position}`;
      area.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        width: 30px;
        background: transparent;
        cursor: text;
        z-index: 10;
        ${position === 'before' ? 'left: -15px;' : 'right: -15px;'}
      `;
      
      area.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Find the editor view
        const editorView = (window as any).currentEditorView;
        if (!editorView) return;
        
        // Get the image's position in the document
        const imageRange = this.findImageRange(editorView, this.src, this.alt);
        if (!imageRange) return;
        
        // Calculate cursor position
        let cursorPos: number;
        if (position === 'before') {
          cursorPos = imageRange.from;
        } else {
          cursorPos = imageRange.to;
        }
        
        // Set cursor position
        editorView.dispatch({
          selection: { anchor: cursorPos, head: cursorPos }
        });
        
        // Focus the editor
        editorView.focus();
      });
      
      return area;
    };
    
    // Add click areas for all images (all are now inline)
    const beforeArea = createClickArea('before');
    const afterArea = createClickArea('after');
    span.appendChild(beforeArea);
    span.appendChild(afterArea);
    
    // Add visual indicator for inline mode
    const indicator = document.createElement('span');
    indicator.className = 'inline-image-indicator';
    indicator.textContent = '📷';
    indicator.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 20;
      pointer-events: none;
    `;
    
    span.addEventListener('mouseenter', () => {
      indicator.style.opacity = '1';
    });
    
    span.addEventListener('mouseleave', () => {
      indicator.style.opacity = '0';
    });
    
    span.appendChild(indicator);
  }
  
  private findImageRange(editorView: any, src: string, alt: string): { from: number; to: number } | null {
    const doc = editorView.state.doc;
    const text = doc.toString();
    
    // Find the image markdown in the document
    const imgRe = new RegExp(`!\\[${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\(${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)(?:<!--(?:pos|inline):.*?-->)?`, 'g');
    const match = imgRe.exec(text);
    
    if (match) {
      return {
        from: match.index,
        to: match.index + match[0].length
      };
    }
    
    return null;
  }
  
  private moveImageVertically(deltaY: number, originalPosition: { from: number; to: number }) {
    const editorView = (window as any).currentEditorView;
    if (!editorView) return;
    
    const doc = editorView.state.doc;
    const text = doc.toString();
    
    // Find the current line of the image
    const currentLine = doc.lineAt(originalPosition.from);
    const lineNumber = currentLine.number;
    
    // Calculate how many lines to move up/down based on deltaY
    const lineHeight = 24; // Approximate line height in pixels
    const linesToMove = Math.round(deltaY / lineHeight);
    const targetLineNumber = lineNumber - linesToMove;
    
    // Ensure we don't go beyond document bounds
    if (targetLineNumber < 1 || targetLineNumber > doc.lines) return;
    
    // Find the target line
    const targetLine = doc.line(targetLineNumber);
    
    // Create the image markdown with any existing positioning data
    let imageMarkdown = `![${this.alt}](${this.src})`;
    
    // Preserve existing positioning and size data
    const existingComments = text.substring(originalPosition.from, originalPosition.to).match(/<!--(pos|inline|size):.*?-->/g);
    if (existingComments) {
      imageMarkdown += existingComments.join('');
    }
    
    // Remove image from current position
    let newContent = text.substring(0, originalPosition.from) + text.substring(originalPosition.to);
    
    // Insert image at new position (beginning of target line)
    const insertPosition = targetLine.from;
    const imageWithNewline = imageMarkdown + '\n';
    newContent = newContent.substring(0, insertPosition) + imageWithNewline + newContent.substring(insertPosition);
    
    // Calculate the new document length after insertion
    const newDocLength = newContent.length;
    const selectionPosition = insertPosition + imageWithNewline.length;
    
    // Ensure selection is within document bounds
    const safeSelectionPosition = Math.min(selectionPosition, newDocLength);
    
    // Update the editor content
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newContent
      },
      selection: { anchor: safeSelectionPosition, head: safeSelectionPosition }
    });
    
    // Update the original position for subsequent moves
    originalPosition.from = insertPosition;
    originalPosition.to = insertPosition + imageWithNewline.length;
  }
  
  private addResizeHandles(span: HTMLElement, img: HTMLImageElement) {
    // Create resize handles container
    const resizeContainer = document.createElement('div');
    resizeContainer.className = 'image-resize-container';
    resizeContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 15;
    `;
    
    // Create resize handles
    const handles = [
      { position: 'nw', cursor: 'nw-resize', top: '-4px', left: '-4px' },
      { position: 'ne', cursor: 'ne-resize', top: '-4px', right: '-4px' },
      { position: 'sw', cursor: 'sw-resize', bottom: '-4px', left: '-4px' },
      { position: 'se', cursor: 'se-resize', bottom: '-4px', right: '-4px' }
    ];
    
    handles.forEach(handle => {
      const handleEl = document.createElement('div');
      handleEl.className = `resize-handle resize-${handle.position}`;
      handleEl.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: var(--accent);
        border: 2px solid white;
        border-radius: 50%;
        cursor: ${handle.cursor};
        pointer-events: all;
        ${handle.top ? `top: ${handle.top};` : ''}
        ${handle.bottom ? `bottom: ${handle.bottom};` : ''}
        ${handle.left ? `left: ${handle.left};` : ''}
        ${handle.right ? `right: ${handle.right};` : ''}
      `;
      
      // Add resize functionality
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;
      
      handleEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = img.offsetWidth;
        startHeight = img.offsetHeight;
        
        document.body.style.userSelect = 'none';
        document.body.style.cursor = handle.cursor;
      });
      
      document.addEventListener('mousemove', (e) => {
        if (isResizing) {
          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          
          let newWidth = startWidth;
          let newHeight = startHeight;
          
          // Calculate new dimensions based on handle position
          switch (handle.position) {
            case 'se': // Bottom-right
              newWidth = startWidth + deltaX;
              newHeight = startHeight + deltaY;
              break;
            case 'sw': // Bottom-left
              newWidth = startWidth - deltaX;
              newHeight = startHeight + deltaY;
              break;
            case 'ne': // Top-right
              newWidth = startWidth + deltaX;
              newHeight = startHeight - deltaY;
              break;
            case 'nw': // Top-left
              newWidth = startWidth - deltaX;
              newHeight = startHeight - deltaY;
              break;
          }
          
          // Constrain to reasonable bounds
          const minSize = 50;
          const maxSize = 800;
          newWidth = Math.max(minSize, Math.min(maxSize, newWidth));
          newHeight = Math.max(minSize, Math.min(maxSize, newHeight));
          
          // Apply new size
          img.style.width = `${newWidth}px`;
          img.style.height = `${newHeight}px`;
          img.style.maxWidth = 'none';
          img.style.maxHeight = 'none';
        }
      });
      
      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          
          // Save the new size
          this.saveImageSize(img, img.offsetWidth, img.offsetHeight);
        }
      });
      
      resizeContainer.appendChild(handleEl);
    });
    
    // Show/hide resize handles on hover
    span.addEventListener('mouseenter', () => {
      resizeContainer.style.opacity = '1';
    });
    
    span.addEventListener('mouseleave', () => {
      resizeContainer.style.opacity = '0';
    });
    
    span.appendChild(resizeContainer);
  }
  
  private saveImageSize(img: HTMLImageElement, width: number, height: number) {
    // Find the editor view
    const editorView = (window as any).currentEditorView;
    if (!editorView) return;
    
    // Get current content
    const currentContent = editorView.state.doc.toString();
    
    // Create size data
    const sizeData = {
      width,
      height,
      timestamp: Date.now()
    };
    
    // Create a custom markdown format with size data
    const sizedMarkdown = `![${this.alt}](${this.src})<!--size:${JSON.stringify(sizeData)}-->`;
    
    // Find and replace the original image markdown
    const originalMarkdown = `![${this.alt}](${this.src})`;
    const existingSizedMarkdown = new RegExp(`!\\[${this.alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\(${this.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)(?:<!--(?:pos|inline|size):.*?-->)*`, 'g');
    
    let newContent = currentContent;
    if (existingSizedMarkdown.test(currentContent)) {
      newContent = currentContent.replace(existingSizedMarkdown, sizedMarkdown);
    } else {
      newContent = currentContent.replace(originalMarkdown, sizedMarkdown);
    }
    
    // Update the editor content
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newContent
      }
    });
  }
}

class ChecklistWidget extends WidgetType {
  constructor(
    private indent: string, 
    private checked: boolean, 
    private content: string, 
    private from: number, 
    private to: number
  ) { 
    super(); 
  }
  
  toDOM() {
    const container = document.createElement('div');
    container.className = 'checklist-item';
    container.style.cssText = `
      display: flex;
      align-items: center;
      margin: 0 !important;
      padding: 0 !important;
      height: 1.6em !important;
      line-height: 1.6em !important;
      font-family: inherit !important;
      font-size: inherit !important;
      box-sizing: border-box !important;
      border: none !important;
      outline: none !important;
    `;
    
    // Add indentation
    if (this.indent) {
      const indentSpan = document.createElement('span');
      indentSpan.textContent = this.indent;
      indentSpan.style.whiteSpace = 'pre';
      container.appendChild(indentSpan);
    }
    
    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.style.cssText = `
      margin-right: 8px;
      margin-top: 2px;
      cursor: pointer;
      transform: scale(1.1);
      flex-shrink: 0;
    `;
    
    // Handle checkbox toggle
    checkbox.addEventListener('change', () => {
      this.toggleCheckbox();
    });
    
    container.appendChild(checkbox);
    
    // Create content span
    const contentSpan = document.createElement('span');
    contentSpan.textContent = this.content;
    contentSpan.style.cssText = `
      flex: 1;
      text-decoration: ${this.checked ? 'line-through' : 'none'};
      opacity: ${this.checked ? '0.6' : '1'};
      color: ${this.checked ? 'var(--text-secondary)' : 'var(--text-primary)'};
      line-height: 1.5;
    `;
    
    container.appendChild(contentSpan);
    
    return container;
  }
  
  private toggleCheckbox() {
    const editorView = (window as any).currentEditorView;
    if (!editorView) return;
    
    const doc = editorView.state.doc;
    const text = doc.toString();
    
    // Find the current line
    const currentLine = doc.lineAt(this.from);
    const lineText = currentLine.text;
    
    // Toggle the checkbox state
    const newLineText = this.checked 
      ? lineText.replace('- [x]', '- [ ]')
      : lineText.replace('- [ ]', '- [x]');
    
    // Update the document
    const newContent = text.substring(0, currentLine.from) + newLineText + text.substring(currentLine.to);
    
    editorView.dispatch({
      changes: {
        from: currentLine.from,
        to: currentLine.to,
        insert: newLineText
      }
    });
  }
}

export default function CMMarkdownEditor({ value, onChange, onAutoSave, className, placeholder, token }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<number | null>(null);

  const mdHighlight = HighlightStyle.define((() => {
    const styles: any[] = [];
    if ((t as any).heading1) styles.push({ tag: (t as any).heading1, fontSize: '1.75rem', fontWeight: '700' });
    if ((t as any).heading2) styles.push({ tag: (t as any).heading2, fontSize: '1.5rem', fontWeight: '700' });
    if ((t as any).heading3) styles.push({ tag: (t as any).heading3, fontSize: '1.25rem', fontWeight: '700' });
    if ((t as any).heading) styles.push({ tag: (t as any).heading, fontWeight: '700' });
    if ((t as any).strong) styles.push({ tag: (t as any).strong, fontWeight: '700' });
    if ((t as any).emphasis) styles.push({ tag: (t as any).emphasis, fontStyle: 'italic' });
    if ((t as any).blockquote) styles.push({ tag: (t as any).blockquote, color: 'var(--text-muted)' });
    if ((t as any).code) styles.push({ tag: (t as any).code, fontFamily: "SF Mono, SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace" });
    return styles;
  })());

  useEffect(() => {
    if (!ref.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        markdown(),
        richDecorField,
        syntaxHighlighting(mdHighlight),
        EditorView.lineWrapping,
        keymap.of(historyKeymap),
        EditorView.domEventHandlers({
          drop(event, view) {
            const dt = event.dataTransfer;
            if (!dt) return;
            
            // Handle image repositioning
            const imageData = dt.getData('application/x-image');
            if (imageData) {
              try {
                const image = JSON.parse(imageData);
                event.preventDefault();
                const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
                const pos = coords ? coords : view.state.selection.main.from;
                
                // Insert the image at the new position
                const md = `\n![${image.alt}](${image.src})\n`;
                view.dispatch({ 
                  changes: { from: pos, to: pos, insert: md }, 
                  selection: { anchor: pos + md.length } 
                });
                return;
              } catch (e) {
                // Fall through to file upload handling
              }
            }
            
            // Handle file uploads
            const files = Array.from(dt.files || []).filter(f => f.type.startsWith('image/'));
            if (files.length === 0) return;
            event.preventDefault();
            const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
            const pos = coords ? coords : view.state.selection.main.from;
            for (const file of files) {
              uploadImage(file, token).then(url => {
                const md = `\n![image](${url})\n`;
                view.dispatch({ changes: { from: pos, to: pos, insert: md }, selection: { anchor: pos + md.length } });
              }).catch(() => {});
            }
          },
          paste(event, view) {
            const items = Array.from(event.clipboardData?.items || []);
            const files = items.map(i => i.getAsFile()).filter(Boolean) as File[];
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return;
            event.preventDefault();
            const pos = view.state.selection.main.from;
            for (const file of imageFiles) {
              uploadImage(file, token).then(url => {
                const md = `\n![image](${url})\n`;
                view.dispatch({ changes: { from: pos, to: pos, insert: md }, selection: { anchor: pos + md.length } });
              }).catch(() => {});
            }
          }
        }),
        keymap.of([
          {
            key: 'Enter',
            run: (view) => {
              const { from, to } = view.state.selection.main;
              view.dispatch({ 
                changes: { from, to, insert: '\n' },
                selection: { anchor: from + 1 }
              });
              return true;
            }
          },
          {
            key: 'Shift-Enter',
            run: (view) => {
              const { from, to } = view.state.selection.main;
              view.dispatch({ 
                changes: { from, to, insert: '\n' },
                selection: { anchor: from + 1 }
              });
              return true;
            }
          }
        ]),
        EditorView.updateListener.of((v: ViewUpdate) => {
          if (v.docChanged) {
            const text = v.state.doc.toString();
            onChange(text);
            if (onAutoSave) {
              if (saveTimer.current) window.clearTimeout(saveTimer.current);
              saveTimer.current = window.setTimeout(() => onAutoSave(text), 800);
            }
          }
        }),
        // Placeholder extension unavailable in this version; omit for now
        EditorView.theme({
          '&': { border: '1px solid var(--card-border)', borderRadius: '8px' },
          '.cm-editor': { padding: '14px' },
          '.cm-scroller': { padding: '4px 6px' },
          '.cm-content': { fontFamily: "SF Mono, SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace", lineHeight: '1.6', caretColor: 'var(--foreground)', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
          '.cm-math-inline': { padding: '0 2px', fontSize: '1em', fontFamily: 'Times New Roman, Times, serif' },
          '.cm-math-block': { padding: '6px 8px', fontSize: '1.25em', fontFamily: 'Times New Roman, Times, serif' },
          '.cm-math-inline *': { fontFamily: 'Times New Roman, Times, serif' },
          '.cm-math-block *': { fontFamily: 'Times New Roman, Times, serif' },
          '.cm-image-inline': { padding: '8px 12px', boxSizing: 'border-box' },
          '.cm-image-inline img': { display: 'block', margin: '0 auto' }
        })
      ]
    });
    const view = new EditorView({ state, parent: ref.current });
    viewRef.current = view;
    (window as any).currentEditorView = view; // Set global reference for positioning functions
    return () => { 
      view.destroy(); 
      (window as any).currentEditorView = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={ref} className={className} />;
}

async function uploadImage(file: File, token: string | null): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }
  
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';
  const res = await fetch(`${API_BASE_URL}/upload/`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error('upload failed');
  const data = await res.json();
  return data.url as string;
}


