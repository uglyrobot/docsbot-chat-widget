let hljsPromise = null;

export function getHighlightJs() {
  if (!hljsPromise) {
    hljsPromise = Promise.all([
      import('highlight.js/lib/common'),
      import('highlightjs-copy')
    ]).then(([
      { default: hljs },
      { default: CopyButtonPlugin }
    ]) => {
      hljs.configure({ignoreUnescapedHTML: true});
      hljs.addPlugin(new CopyButtonPlugin());
      
      return hljs;
    });
  }
  return hljsPromise;
} 