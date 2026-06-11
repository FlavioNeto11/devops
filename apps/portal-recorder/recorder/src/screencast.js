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
      if (msg.action === 'char' && msg.text) {
        await cdp.send('Input.insertText', { text: msg.text }).catch(() => {});
        return;
      }
      await cdp.send('Input.dispatchKeyEvent', {
        type: msg.action === 'down' ? 'keyDown' : 'keyUp',
        key: msg.key,
        text: msg.text,
      }).catch(() => {});
    }
  }

  async function stop() {
    await cdp.send('Page.stopScreencast').catch(() => {});
  }

  return { dispatchInput, stop };
}
