"""Manually generate standalone QR deliverables; never used by the website build."""
from pathlib import Path

from PIL import Image
import qrcode
import zxingcpp

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'generated' / 'qr_codes'
LINKS = {
    'QR_AHMAD_STATIC.png': 'https://turkluxx.com/?ref=AHMAD&lang=en',
    'QR_ALMA_STATIC.png': 'https://turkluxx.com/?ref=ALMA&lang=en',
    'QR_VLAD_STATIC.png': 'https://turkluxx.com/?ref=VLAD&lang=en',
    'QR_MOHAMED_STATIC.png': 'https://turkluxx.com/?ref=MOHAMED&lang=en',
    'QR_TIM_BOND_STATIC.png': 'https://turkluxx.com/?ref=TIM_BOND&lang=nl',
}


def main(output=OUTPUT):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    logo = Image.open(ROOT / 'img/favicon/master.png').convert('RGBA')
    for filename, url in LINKS.items():
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,
                           box_size=1, border=4)
        qr.add_data(url)
        qr.make(fit=True)
        matrix = qr.make_image(fill_color='black', back_color='white').convert('RGB')
        scale = 1000 // matrix.width
        matrix = matrix.resize((matrix.width * scale, matrix.height * scale),
                               Image.Resampling.NEAREST)
        canvas = Image.new('RGB', (1000, 1000), 'white')
        offset = (1000 - matrix.width) // 2
        canvas.paste(matrix, (offset, offset))
        # Keep the logo and its white backing below one fifth of the symbol width.
        badge_size = int(qr.modules_count * scale * 0.19)
        badge = Image.new('RGBA', (badge_size, badge_size), 'white')
        emblem = logo.copy()
        emblem.thumbnail((badge_size - 12, badge_size - 12), Image.Resampling.LANCZOS)
        badge.alpha_composite(emblem, ((badge_size - emblem.width) // 2,
                                      (badge_size - emblem.height) // 2))
        canvas.paste(badge, ((1000 - badge_size) // 2, (1000 - badge_size) // 2), badge)
        path = output / filename
        canvas.save(path, format='PNG')
        with Image.open(path) as saved:
            assert saved.size == (1000, 1000) and saved.format == 'PNG'
            decoded = zxingcpp.read_barcode(saved)
            assert decoded and decoded.text == url, f'Cannot decode {filename}'
            assert decoded.ec_level == 'H', f'Wrong error correction: {filename}'
        label = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        print(f'{label}: H, 1000x1000, decoded {url}')


if __name__ == '__main__':
    main()
