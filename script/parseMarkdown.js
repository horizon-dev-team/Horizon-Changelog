function parseMarkdown(md, repoSlug) {
  if (!md) return '';
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const store = { safe: [], block: [], inline: [] };
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

  const extract = (type) => (match, content) => {
    const prefix = type[0].toUpperCase(); // S, B, I
    store[type].push(type === 'block' ? `<pre><code>${content}</code></pre>` : type === 'inline' ? `<code>${content}</code>` : match);
    return `\x00${prefix}${store[type].length - 1}\x00`;
  };

  const restore = (type) => (match, index) => store[type][+index];

  const prRefUrl = repoSlug
    ? `https://github.com/${repoSlug}/pull/$2`
    : `https://github.com/search?q=$2+type%3Apr`;

  const pipeline = [
    { pattern: /<!--[\s\S]*?-->/g, replace: '' },
    { pattern: /<(img|video|audio|iframe|br|hr|details|\/details|summary|\/summary|sup|\/sup|sub|\/sub|b|\/b|i|\/i|strong|\/strong|em|\/em|ins|\/ins|del|\/del|kbd|\/kbd|mark|\/mark|p|\/p|input|icon|\/icon)\b[^>]*>/gi, replace: extract('safe') },
    { pattern: /[&<>"']/g, replace: (char) => escapeMap[char] },
    { pattern: /\x00S(\d+)\x00/g, replace: restore('safe') },
    { pattern: /&lt;(https?:\/\/[^\s]+)&gt;/g, replace: '$1' },
    { pattern: /```([\s\S]*?)```/g, replace: extract('block') },
    { pattern: /`([^`]+)`/g, replace: extract('inline') },
    { pattern: /(^|[^"'\]\(=])(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g, replace: '$1<button class="media-link video-link" data-media-url="https://www.youtube.com/embed/$2"><i class="fab fa-youtube"></i> Видео с YouTube</button>' },
    { pattern: /(^|[^"'\]\(=])(https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+)/g, replace: '$1<video class="md-video" src="$2" controls preload="metadata"></video>' },
    { pattern: /(^|[^"'\]\(=])(https?:\/\/[^\s)]+\.(?:mp3|wav|ogg))/g, replace: '$1<a href="$2" target="_blank" class="media-link audio-link"><i class="fas fa-music"></i> Открыть аудио</a>' },
    { pattern: /\[([^\]]+\.(?:mp3|wav|ogg))\]\((https?:\/\/[^\s)]+)\)/g, replace: '<a href="$2" target="_blank" class="media-link audio-link"><i class="fas fa-music"></i> $1</a>' },
    { pattern: /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, replace: '<figure class="md-image"><img src="$2" alt="$1"></figure>' },
    { pattern: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, replace: '<a href="$2" target="_blank">$1</a>' },
    { pattern: /(^|[^/\w&])#(\d{2,7})\b/g, replace: `$1<a href="${prRefUrl}" target="_blank" class="pr-ref">#$2</a>` },
    { pattern: /~~([^~]+)~~/g, replace: '<del>$1</del>' },
    { pattern: /^---+\s*$/gm, replace: '<hr>' },
    { pattern: /^### (.*$)/gim, replace: '<h3>$1</h3>\n\n' },
    { pattern: /^## (.*$)/gim, replace: '<h2>$1</h2>\n\n' },
    { pattern: /^# (.*$)/gim, replace: '<h1>$1</h1>\n\n' },
    { pattern: /^&gt; (.*)$/gim, replace: '<blockquote>$1</blockquote>' },
    { pattern: /\*\*(.*?)\*\*/g, replace: '<strong>$1</strong>' },
    { pattern: /\*(.*?)\*/g, replace: '<em>$1</em>' },
    { pattern: /(?<![\w])_([^_]+)_(?![\w])/g, replace: '<em>$1</em>' },
    { pattern: /^[\t ]*[-*] (.*)$/gim, replace: '<li>$1</li>' },
    { pattern: /^[\t ]*\d+\. (.*)$/gim, replace: '<li>$1</li>' },
    { pattern: /(<li>.*?<\/li>\n?)+/gs, replace: (match) => `<ul>${match}</ul>\n\n` },
    { pattern: /\x00I(\d+)\x00/g, replace: restore('inline') },
    { pattern: /\x00B(\d+)\x00/g, replace: restore('block') },
  ];

  let html = pipeline.reduce((text, rule) => text.replace(rule.pattern, rule.replace), md);

  html = html.replace(/(<\/(?:ul|ol|blockquote|pre|hr)>)\n/g, '$1\n\n');
  html = html.replace(/\n(<(?:ul|ol|blockquote|hr|pre|details))/g, '\n\n$1');

  html = html.split(/\n\n+/).map(paragraph => {
    paragraph = paragraph.trim();
    if (!paragraph) return '';
    if (/^<(h\d|ul|ol|figure|img|pre|blockquote|table|video|audio|iframe|details|hr|del)\b/i.test(paragraph) || /^\x00B\d+\x00/.test(paragraph)) {
      return paragraph;
    }
    return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

window.parseMarkdown = parseMarkdown;