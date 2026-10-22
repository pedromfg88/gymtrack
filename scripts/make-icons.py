#!/usr/bin/env python3
"""Gera os ícones da APK (native/res/**). Só é preciso voltar a correr se quiseres mudar o desenho."""
from PIL import Image, ImageDraw
import os

BG = (14, 15, 17, 255)        # #0E0F11 — fundo da app
LIME = (200, 255, 61, 255)    # #C8FF3D — cor de destaque
OUT = os.path.join(os.path.dirname(__file__), '..', 'native', 'res')
S = 1024  # tamanho de trabalho


def glyph(draw, scale, cx, cy):
    """Haltere, desenhado num quadro de 100x100 e centrado em (cx, cy)."""
    def P(x, y):
        return (cx + (x - 50) * scale, cy + (y - 50) * scale)

    def box(x0, y0, x1, y1, r):
        (a, b), (c, d) = P(x0, y0), P(x1, y1)
        draw.rounded_rectangle([a, b, c, d], radius=r * scale, fill=LIME)

    box(20, 46, 80, 54, 3)       # barra
    box(27, 27, 38, 73, 4.5)     # discos interiores
    box(62, 27, 73, 73, 4.5)
    box(14, 36, 24, 64, 4)       # discos exteriores
    box(76, 36, 86, 64, 4)


def legacy_square():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    glyph(d, scale=S * 0.66 / 80, cx=S / 2, cy=S / 2)
    return im


def legacy_round():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, S - 1, S - 1], fill=BG)
    glyph(d, scale=S * 0.58 / 80, cx=S / 2, cy=S / 2)
    return im


def adaptive_foreground():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    glyph(d, scale=S * 0.52 / 80, cx=S / 2, cy=S / 2)   # dentro da zona segura (66 %)
    return im


dens = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}
sq, rd, fg = legacy_square(), legacy_round(), adaptive_foreground()
for name, f in dens.items():
    folder = os.path.join(OUT, f'mipmap-{name}')
    os.makedirs(folder, exist_ok=True)
    sz = int(round(48 * f)); fz = int(round(108 * f))
    sq.resize((sz, sz), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
    rd.resize((sz, sz), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_round.png'))
    fg.resize((fz, fz), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_foreground.png'))

# ecrã de arranque: cor lisa (fica esticado); e um ícone grande para referência
os.makedirs(OUT, exist_ok=True)
Image.new('RGB', (64, 64), BG[:3]).save(os.path.join(OUT, 'splash.png'))
sq.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
print('Ícones gerados em', os.path.abspath(OUT))
