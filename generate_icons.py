# generate_icons.py - 生成 MyRandomToDo928 的 PWA 图标
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

BG = (31, 34, 38, 255)      # 深色圆角底
DIE = (255, 255, 255, 255)  # 白色骰子
PIP = (31, 34, 38, 255)     # 骰子点数


def make(size, fname):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 背景圆角方块
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=BG)
    # 骰子方块
    m = int(size * 0.20)
    d.rounded_rectangle([m, m, size - m, size - m],
                        radius=int(size * 0.13), fill=DIE)
    # 5 点布局：中心 + 四角
    r = int(size * 0.052)
    off = int(size * 0.115)   # 角点距骰子边缘
    cx, cy = size // 2, size // 2
    left, right = m + off, size - m - off
    top, bottom = m + off, size - m - off
    for (px, py) in [(cx, cy),
                     (left, top), (right, top),
                     (left, bottom), (right, bottom)]:
        d.ellipse([px - r, py - r, px + r, py + r], fill=PIP)
    img.save(os.path.join(OUT, fname))
    print("saved", fname, size)


make(192, "icon-192.png")
make(512, "icon-512.png")
make(180, "icon-180.png")
