// The quick-guide rows (key chips + what they do), shared by the first-run screen and the Help sheet.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Guide = factory();
})(this, function () {
  const ROWS = [
    { keys: ['+'], text: 'guide.add' },
    { keys: ['Cmd+R', '1-9'], text: 'guide.switch' },
    { keys: ['Cmd+R', 's', '1-9'], text: 'guide.split' },
    { keys: ['Ctrl', 'Tab'], text: 'guide.switcher', hold: true },
    { keys: ['Cmd+R', '?'], text: 'guide.help' },
    { keys: ['Cmd+R', 'v'], text: 'guide.blur' },
    { keys: ['Cmd+,'], text: 'guide.settings' },
  ];

  // tr(key) -> text. Builds the rows with DOM nodes only (no innerHTML).
  function render(container, tr, doc = document) {
    container.replaceChildren(...ROWS.map((item) => {
      const row = doc.createElement('div');
      row.className = 'row';
      const keys = doc.createElement('span');
      keys.className = 'keys';
      item.keys.forEach((k, i) => {
        if (i > 0) {
          const sep = doc.createElement('span');
          sep.className = 'then';
          sep.textContent = item.hold ? '+' : '›';
          keys.append(sep);
        }
        const kbd = doc.createElement('kbd');
        kbd.textContent = k;
        keys.append(kbd);
      });
      const text = doc.createElement('span');
      text.textContent = tr(item.text);
      row.append(keys, text);
      return row;
    }));
  }

  return { ROWS, render };
});
