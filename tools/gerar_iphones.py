"""Gera as ilustrações SVG dos iPhones usadas na home (assets/phones/).

Cada aparelho segue o layout real de câmera da sua geração:
  - iPhone 11/12 ........ módulo quadrado, 2 lentes na vertical
  - iPhone 13/14/15 ..... módulo quadrado, 2 lentes na diagonal
  - iPhone 16 Pro ....... módulo quadrado, 3 lentes em triângulo
  - iPhone 17 Pro/18 Pro  barra ("platô") de ponta a ponta, 3 lentes + flash + LiDAR
  - iPhone 18 ........... cápsula vertical com 2 lentes, flash ao lado

Uso:  python3 tools/gerar_iphones.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "phones"

W, H, R = 300, 620, 54      # corpo do aparelho
PAD = 6                      # espaço para os botões laterais


def shade(hex_color, f):
    """Clareia (f>0) ou escurece (f<0) uma cor hex."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if f >= 0:
        r, g, b = (round(c + (255 - c) * f) for c in (r, g, b))
    else:
        r, g, b = (round(c * (1 + f)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def defs(uid, body, frame):
    return f"""
  <defs>
    <linearGradient id="{uid}-frame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{shade(frame, -.35)}"/>
      <stop offset=".06" stop-color="{shade(frame, .55)}"/>
      <stop offset=".14" stop-color="{shade(frame, -.05)}"/>
      <stop offset=".86" stop-color="{shade(frame, -.1)}"/>
      <stop offset=".95" stop-color="{shade(frame, .35)}"/>
      <stop offset="1" stop-color="{shade(frame, -.45)}"/>
    </linearGradient>
    <linearGradient id="{uid}-back" x1="0" y1="0" x2=".35" y2="1">
      <stop offset="0" stop-color="{shade(body, .16)}"/>
      <stop offset=".45" stop-color="{body}"/>
      <stop offset="1" stop-color="{shade(body, -.28)}"/>
    </linearGradient>
    <linearGradient id="{uid}-sheen" x1="0" y1="0" x2="1" y2=".55">
      <stop offset="0" stop-color="#fff" stop-opacity=".34"/>
      <stop offset=".3" stop-color="#fff" stop-opacity=".06"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".22"/>
    </linearGradient>
    <linearGradient id="{uid}-bump" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{shade(body, .3)}"/>
      <stop offset=".5" stop-color="{shade(body, .05)}"/>
      <stop offset="1" stop-color="{shade(body, -.3)}"/>
    </linearGradient>
    <radialGradient id="{uid}-ring" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="{shade(frame, .6)}"/>
      <stop offset=".6" stop-color="{shade(frame, -.1)}"/>
      <stop offset="1" stop-color="{shade(frame, -.55)}"/>
    </radialGradient>
    <radialGradient id="{uid}-glass" cx=".42" cy=".38" r=".62">
      <stop offset="0" stop-color="#3a4a6a"/>
      <stop offset=".28" stop-color="#141b2b"/>
      <stop offset=".62" stop-color="#05070c"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <radialGradient id="{uid}-coat" cx=".7" cy=".75" r=".5">
      <stop offset="0" stop-color="#6f7dff" stop-opacity=".16"/>
      <stop offset="1" stop-color="#7a5cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="{uid}-flash" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#fffdf2"/>
      <stop offset=".55" stop-color="#e9dfc2"/>
      <stop offset="1" stop-color="#9c937a"/>
    </radialGradient>
    <clipPath id="{uid}-clip"><rect x="{PAD}" y="0" width="{W}" height="{H}" rx="{R}"/></clipPath>
  </defs>"""


def lens(uid, cx, cy, r):
    """Lente com anel metálico, anel preto, vidro e reflexos."""
    return f"""
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{uid}-ring)"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .86}" fill="#0b0b0d"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .74}" fill="url(#{uid}-glass)"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .74}" fill="url(#{uid}-coat)"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .36}" fill="#020306" stroke="#26314a" stroke-width="{r * .05}"/>
    <ellipse cx="{cx - r * .28}" cy="{cy - r * .3}" rx="{r * .2}" ry="{r * .12}" fill="#fff" opacity=".55" transform="rotate(-35 {cx - r * .28} {cy - r * .3})"/>
    <circle cx="{cx + r * .3}" cy="{cy + r * .26}" r="{r * .06}" fill="#9fb4ff" opacity=".6"/>"""


def flash(uid, cx, cy, r):
    return f"""
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="{shade('#888888', -.2)}" opacity=".5"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .8}" fill="url(#{uid}-flash)"/>"""


def lidar(cx, cy, r):
    return f"""
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="#0a0a0c"/>
    <circle cx="{cx}" cy="{cy}" r="{r * .55}" fill="#1c1c22"/>"""


def mic(cx, cy):
    return f'\n    <circle cx="{cx}" cy="{cy}" r="2.6" fill="#000" opacity=".55"/>'


def square_bump(uid, x, y, s, rr):
    return f"""
    <rect x="{x + 2}" y="{y + 4}" width="{s}" height="{s}" rx="{rr}" fill="#000" opacity=".22"/>
    <rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{rr}" fill="url(#{uid}-bump)"/>
    <rect x="{x + 1.5}" y="{y + 1.5}" width="{s - 3}" height="{s - 3}" rx="{rr - 1.5}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>"""


def camera(uid, kind, body):
    x0 = PAD
    if kind == "dual-vertical":            # iPhone 11 / 12
        bx, by, s = x0 + 22, 22, 128
        return (square_bump(uid, bx, by, s, 34) + lens(uid, bx + 36, by + 36, 27)
                + lens(uid, bx + 36, by + 92, 27) + flash(uid, bx + 94, by + 30, 11) + mic(bx + 94, by + 64))
    if kind == "dual-diagonal":            # iPhone 13 / 14 / 15
        bx, by, s = x0 + 22, 22, 132
        return (square_bump(uid, bx, by, s, 36) + lens(uid, bx + 94, by + 38, 28)
                + lens(uid, bx + 38, by + 94, 28) + flash(uid, bx + 34, by + 32, 11) + mic(bx + 100, by + 100))
    if kind == "triple":                   # iPhone 16 Pro
        bx, by, s = x0 + 18, 18, 150
        return (square_bump(uid, bx, by, s, 40) + lens(uid, bx + 40, by + 40, 33)
                + lens(uid, bx + 40, by + 110, 33) + lens(uid, bx + 108, by + 75, 33)
                + flash(uid, bx + 112, by + 28, 10) + lidar(bx + 112, by + 122, 9) + mic(bx + 76, by + 18))
    if kind == "capsule":                  # iPhone 18 (base)
        cx, top = x0 + 62, 30
        return (f"""
    <rect x="{cx - 34}" y="{top + 3}" width="68" height="150" rx="34" fill="#000" opacity=".2"/>
    <rect x="{cx - 34}" y="{top}" width="68" height="150" rx="34" fill="url(#{uid}-bump)"/>
    <rect x="{cx - 32.5}" y="{top + 1.5}" width="65" height="147" rx="32.5" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>"""
                + lens(uid, cx, top + 37, 30) + lens(uid, cx, top + 113, 30)
                + flash(uid, cx + 62, top + 40, 11) + mic(cx + 62, top + 74))
    if kind == "plateau":                  # iPhone 17 Pro / 18 Pro / 18 Pro Max
        ph = 196
        glass = shade(body, -.08)
        return f"""
    <rect x="{x0}" y="{ph}" width="{W}" height="{H - ph}" fill="{glass}" opacity=".55" clip-path="url(#{uid}-clip)"/>
    <rect x="{x0}" y="{ph}" width="{W}" height="2" fill="#fff" opacity=".18"/>
    <rect x="{x0}" y="0" width="{W}" height="{ph}" fill="url(#{uid}-bump)" clip-path="url(#{uid}-clip)"/>
    <rect x="{x0}" y="{ph - 3}" width="{W}" height="6" fill="#000" opacity=".18"/>
    <rect x="{x0}" y="{ph - 46}" width="10" height="4" fill="{shade(body, -.35)}" opacity=".8"/>
    <rect x="{x0 + W - 10}" y="{ph - 46}" width="10" height="4" fill="{shade(body, -.35)}" opacity=".8"/>
    <rect x="{x0 + 14}" y="16" width="164" height="164" rx="44" fill="{shade(body, -.55)}" opacity=".35"/>""" + (
            lens(uid, x0 + 57, 59, 36) + lens(uid, x0 + 57, 137, 36) + lens(uid, x0 + 131, 98, 36)
            + flash(uid, x0 + 228, 66, 12) + lidar(x0 + 228, 128, 10) + mic(x0 + 262, 98))
    raise ValueError(kind)


def phone_svg(uid, body, frame, kind):
    total_w = W + PAD * 2
    btn = shade(frame, -.15)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {H}" width="{total_w}" height="{H}">{defs(uid, body, frame)}
  <!-- botões laterais -->
  <rect x="1" y="118" width="7" height="26" rx="3" fill="{btn}"/>
  <rect x="1" y="168" width="7" height="52" rx="3" fill="{btn}"/>
  <rect x="1" y="232" width="7" height="52" rx="3" fill="{btn}"/>
  <rect x="{total_w - 8}" y="190" width="7" height="80" rx="3" fill="{btn}"/>
  <!-- aro -->
  <rect x="{PAD}" y="0" width="{W}" height="{H}" rx="{R}" fill="url(#{uid}-frame)"/>
  <!-- traseira -->
  <rect x="{PAD + 5}" y="5" width="{W - 10}" height="{H - 10}" rx="{R - 5}" fill="url(#{uid}-back)"/>
  <g clip-path="url(#{uid}-clip)">{camera(uid, kind, body)}
  </g>
  <!-- brilho do vidro -->
  <rect x="{PAD + 5}" y="5" width="{W - 10}" height="{H - 10}" rx="{R - 5}" fill="url(#{uid}-sheen)"/>
  <rect x="{PAD + .75}" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="{R - .75}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5"/>
</svg>
"""


PHONES = {
    # hero — cores da referência do cliente
    "iphone-18":         ("#e4e1dc", "#d2cec7", "capsule"),   # prata/branco
    "iphone-18-pro":     ("#c27a4a", "#d9996b", "plateau"),   # cobre
    "iphone-18-pro-max": ("#36322f", "#57524d", "plateau"),   # grafite escuro
    # modelos aceitos
    "iphone-11":         ("#232325", "#3b3b3e", "dual-vertical"),  # preto
    "iphone-12":         ("#f1efea", "#d9d6cf", "dual-vertical"),  # branco
    "iphone-13":         ("#24435f", "#2f5373", "dual-diagonal"),  # azul
    "iphone-14":         ("#b9a9cc", "#a796bd", "dual-diagonal"),  # roxo
    "iphone-15":         ("#c9d7df", "#b1c2cc", "dual-diagonal"),  # azul claro
    "iphone-16":         ("#c8b39c", "#bfa98f", "triple"),         # titânio deserto (16 Pro)
    "iphone-17":         ("#d06b2e", "#de8a52", "plateau"),        # laranja cósmico (17 Pro)
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (body, frame, kind) in PHONES.items():
        uid = name.replace("iphone-", "p")
        (OUT / f"{name}.svg").write_text(phone_svg(uid, body, frame, kind), encoding="utf-8")
        print("ok", name)
