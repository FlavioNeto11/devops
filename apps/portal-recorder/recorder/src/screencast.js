// screencast.js — streaming do browser remoto via CDP (sem noVNC/Xvfb).
// Reaproveita o MESMO CDPSession da captura: Page.startScreencast emite frames
// jpeg; Input.dispatch* injeta mouse/teclado do usuário. As coordenadas chegam
// do frontend já em pixels do VIEWPORT (o canvas mapeia a escala).

const SCREENCAST_OPTS = {
  format: 'jpeg',
  quality: Number(process.env.SCREENCAST_QUALITY || 55),
  maxWidth: 1280,
  maxHeight: 800,
  everyNthFrame: Number(process.env.SCREENCAST_EVERY_NTH || 2),
};

const MOUSE_TYPE = { move: 'mouseMoved', down: 'mousePressed', up: 'mouseReleased', wheel: 'mouseWheel' };
const BUTTONS = ['left', 'middle', 'right'];

// Teclas de CONTROLE precisam de windowsVirtualKeyCode — sem ele o Chrome ignora
// Backspace/Enter/Tab/setas/etc. Caracteres imprimíveis vão por Input.insertText.
const VK = Object.freeze({
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32, PageUp: 33, PageDown: 34,
  End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46, Shift: 16, Control: 17, Alt: 18,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
});

export async function attachScreencast(cdp, onFrame) {
  await cdp.send('Page.startScreencast', SCREENCAST_OPTS);

  cdp.on('Page.screencastFrame', async (evt) => {
    try {
      onFrame({ data: evt.data, width: evt.metadata?.deviceWidth || 1280, height: evt.metadata?.deviceHeight || 800 });
    } finally {
      // ACK obrigatório, senão o Chrome para de enviar frames.
      await cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId }).catch(() => {});
    }
  });

  async function dispatchInput(msg) {
    if (msg.type === 'mouse') {
      const type = MOUSE_TYPE[msg.action];
      if (!type) return;
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(msg.x || 0),
        y: Math.round(msg.y || 0),
        button: msg.action === 'move' ? 'none' : (BUTTONS[msg.button] || 'left'),
        clickCount: msg.action === 'down' || msg.action === 'up' ? 1 : 0,
        deltaX: msg.action === 'wheel' ? (msg.deltaX || 0) : undefined,
        deltaY: msg.action === 'wheel' ? (msg.deltaY || 0) : undefined,
      }).catch(() => {});
    } else if (msg.type === 'key') {
      // Caractere imprimível: insertText é o caminho confiável (acentos inclusos).
      if (msg.action === 'char' && msg.text) {
        await cdp.send('Input.insertText', { text: msg.text }).catch(() => {});
        return;
      }
      // Tecla de controle: precisa de windowsVirtualKeyCode senão o Chrome ignora.
      const vk = VK[msg.key];
      await cdp.send('Input.dispatchKeyEvent', {
        type: msg.action === 'down' ? 'rawKeyDown' : 'keyUp',
        key: msg.key,
        code: msg.code || msg.key,
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk,
        text: vk === 13 ? '\r' : undefined,
      }).catch(() => {});
    }
  }

  async function stop() {
    await cdp.send('Page.stopScreencast').catch(() => {});
  }

  return { dispatchInput, stop };
}
