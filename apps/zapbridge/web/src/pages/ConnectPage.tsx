import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/session.store';
import { Spinner } from '../components/Spinner';
import { IconBack } from '../components/icons';

type Mode = 'qr' | 'pairing';

function formatCode(code: string | null): string {
  if (!code) return '';
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : code;
}

export function ConnectPage() {
  const nav = useNavigate();
  const { status, qr, pairingCode, error, start, startPairing, setQr, setPairingCode, setError } = useSessionStore();
  const [mode, setMode] = useState<Mode>('qr');
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setQr(null);
    setPairingCode(null);
    setError(null);
    setCopied(false);
    if (mode === 'qr') start();
  }, [mode]);

  useEffect(() => {
    if (status === 'connected') nav('/');
  }, [status]);

  const digits = phone.replace(/\D/g, '');
  const canGenerate = digits.length >= 8;

  const copyCode = async () => {
    try {
      await navigator.clipboard?.writeText(formatCode(pairingCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const Tab = ({ label, m }: { label: string; m: Mode }) => (
    <button
      onClick={() => m !== mode && setMode(m)}
      className={`px-4 py-2 rounded-2xl text-[13px] font-semibold border ${
        mode === m ? 'bg-primaryDark border-primaryDark text-white' : 'bg-surface border-line text-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-md mx-auto w-full px-6 py-6 flex flex-col items-center">
        <div className="w-full flex items-center mb-2">
          <button onClick={() => nav('/')} className="text-white" title="Voltar">
            <IconBack />
          </button>
        </div>
        <h1 className="text-2xl font-bold text-white mb-5">Conectar WhatsApp</h1>

        <div className="flex gap-2 mb-6">
          <Tab label="QR Code" m="qr" />
          <Tab label="Número de telefone" m="pairing" />
        </div>

        {mode === 'qr' ? (
          <div className="w-full flex flex-col items-center">
            <p className="text-muted text-center mb-5 leading-relaxed">
              No celular dono da conta: WhatsApp → Aparelhos conectados → Conectar um aparelho, e aponte a câmera para o
              código.
            </p>
            <div className="w-64 h-64 bg-white rounded-lg grid place-items-center overflow-hidden">
              {qr ? (
                <img src={qr} alt="QR Code" className="w-60 h-60 object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Spinner />
                  <span className="text-[#667781]">{status === 'connecting' ? 'Gerando QR Code…' : 'Aguardando…'}</span>
                </div>
              )}
            </div>
            <button onClick={() => start()} className="mt-4 text-primary font-semibold">
              Gerar novo código
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            {!pairingCode ? (
              <>
                <p className="text-muted text-center mb-5 leading-relaxed">
                  Digite o número desta conta com DDI e DDD. Geramos um código de 8 dígitos para você inserir no WhatsApp
                  do celular.
                </p>
                <div className="flex items-center gap-1 bg-surface border border-line rounded-lg px-3 w-full mb-3">
                  <span className="text-white text-lg font-semibold">+</span>
                  <input
                    className="flex-1 bg-transparent py-3 text-lg tracking-wide outline-none"
                    placeholder="55 11 99999 8888"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => startPairing(digits)}
                  disabled={!canGenerate}
                  className="w-full bg-primary text-bg font-bold rounded-lg py-3 min-h-[48px] disabled:opacity-50"
                >
                  {status === 'connecting' ? 'Gerando…' : 'Gerar código'}
                </button>
              </>
            ) : (
              <>
                <div className="text-muted text-sm mb-2">Seu código de pareamento</div>
                <button
                  onClick={copyCode}
                  className="w-full bg-surface border border-primary rounded-lg py-5 px-6 flex flex-col items-center mb-5"
                >
                  <span className="text-primary text-[40px] font-extrabold tracking-[8px] font-mono">
                    {formatCode(pairingCode)}
                  </span>
                  <span className="text-muted text-sm mt-2">{copied ? '✓ Copiado' : '📋 Toque para copiar'}</span>
                </button>
                <ol className="w-full bg-surface rounded-lg p-4 mb-5 space-y-2 text-sm text-white">
                  <li>1. Abra o WhatsApp no celular desta conta.</li>
                  <li>
                    2. Toque em <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.
                  </li>
                  <li>
                    3. Toque em <b>Conectar com número de telefone</b>.
                  </li>
                  <li>4. Digite o código acima no celular.</li>
                </ol>
                <div className="flex items-center gap-2 mb-2">
                  <Spinner size={16} />
                  <span className="text-muted text-sm">Aguardando confirmação no celular…</span>
                </div>
                <button
                  onClick={() => {
                    setPairingCode(null);
                    setPhone('');
                  }}
                  className="mt-2 text-primary font-semibold"
                >
                  Usar outro número
                </button>
              </>
            )}
          </div>
        )}

        {!!error && <div className="text-danger mt-5 text-center">{error}</div>}
        <p className="text-muted text-[11px] text-center mt-8">
          Uso legítimo: conecte apenas a sua própria conta. O ZapBridge não é afiliado ao WhatsApp.
        </p>
      </div>
    </div>
  );
}
