const terminal = new Terminal({
  fontFamily: "'JetBrainsMono Nerd Font Mono', 'JetBrainsMono Nerd Font', 'SF Mono', Menlo, monospace", // Nerd Font so eza/starship icons render
  fontSize: 13,
  cursorBlink: true,
  scrollback: 5000,
  minimumContrastRatio: 4.5, // programs that print pale colours stay readable on white
  theme: {
    background: '#fbfbfc', foreground: '#1d1d1f', cursor: '#1d1d1f', cursorAccent: '#fbfbfc', selectionBackground: '#cfe1fb',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#7d4e00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#9a6700', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
  },
});
const fit = new FitAddon.FitAddon();
terminal.loadAddon(fit);
terminal.open(document.getElementById('term'));
fit.fit();

let exited = false;
const size = () => ({ cols: terminal.cols, rows: terminal.rows });

term.onData((data) => terminal.write(data));
term.onExit((code) => {
  exited = true;
  terminal.write(`\r\n[process exited with code ${code}. Press Enter to start a new shell]\r\n`);
});
terminal.onData((data) => {
  if (exited) {
    if (data === '\r') {
      exited = false;
      terminal.reset();
      term.start(terminal.cols, terminal.rows);
    }
    return;
  }
  term.input(data);
});
terminal.onResize(({ cols, rows }) => term.resize(cols, rows));
new ResizeObserver(() => fit.fit()).observe(document.body);
window.addEventListener('focus', () => terminal.focus());

term.start(size().cols, size().rows);
terminal.focus();
