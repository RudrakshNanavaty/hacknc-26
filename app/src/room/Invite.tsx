// The room code and a QR code, on every player's lobby screen, so anyone can bring a friend in.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { tokens } from '../tokens';

/** Where phones open the room: PUBLIC_URL, else this machine's LAN address on the page's port. */
export function useJoinUrl(code: string) {
  const [url, setUrl] = useState(`${location.origin}/play/${code}`);
  useEffect(() => {
    if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
    fetch('/api/join-base')
      .then((r) => r.json())
      .then(({ publicUrl, lan }: { publicUrl: string | null; lan: string | null }) => {
        const base = publicUrl ?? (lan ? `${location.protocol}//${lan}${location.port ? `:${location.port}` : ''}` : location.origin);
        setUrl(`${base.replace(/\/$/, '')}/play/${code}`);
      })
      .catch(() => {});
  }, [code]);
  return url;
}

export function Invite({ code }: { code: string }) {
  const url = useJoinUrl(code);
  const [svg, setSvg] = useState('');
  useEffect(() => {
    const t = tokens().hex;
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: t.ink, light: t.white } }).then(setSvg, () => setSvg(''));
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div aria-label={`QR code to join room ${code}`} role="img" className="aspect-square w-40 shrink-0 overflow-hidden rounded-xl border border-white bg-white" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="w-full min-w-0">
        <p className="text-15">Scan to join, or enter the code</p>
        <p className="tabular font-display text-[56px] leading-none font-black tracking-[0.12em] text-aqua-deep">{code}</p>
        <p className="mt-1 text-13 [overflow-wrap:anywhere]">{url.replace(/^https?:\/\//, '')}</p>
      </div>
    </div>
  );
}
