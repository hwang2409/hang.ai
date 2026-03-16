import { visit } from 'unist-util-visit'

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export default function remarkWikiLinks() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return
      const { value } = node
      if (!value.includes('[[')) return

      const children = []
      let lastIndex = 0
      let match

      WIKI_LINK_RE.lastIndex = 0
      while ((match = WIKI_LINK_RE.exec(value)) !== null) {
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) })
        }
        const title = match[1].trim()
        const displayText = match[2]?.trim() || title
        children.push({
          type: 'wikiLink',
          data: {
            hName: 'wikilink',
            hProperties: { title, displaytext: displayText },
          },
          children: [{ type: 'text', value: displayText }],
        })
        lastIndex = match.index + match[0].length
      }

      if (children.length === 0) return
      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) })
      }
      parent.children.splice(index, 1, ...children)
      return index + children.length
    })
  }
}
