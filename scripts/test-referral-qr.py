"""Read saved QR artifacts without regenerating them: python scripts/test-referral-qr.py."""
import hashlib
from pathlib import Path
import runpy
import unittest

from PIL import Image
import zxingcpp

config = runpy.run_path(str(Path(__file__).with_name('generate-referral-qr.py')))


class ReferralQRTests(unittest.TestCase):
    def test_four_english_referral_artifacts(self):
        self.assertEqual(len(config['LINKS']), 4)
        for ref in ['AHMAD', 'ALMA', 'VLAD', 'MOHAMED']:
            filename = f'QR_{ref}_STATIC.png'
            expected = f'https://turkluxx.com/?ref={ref}&lang=en'
            with self.subTest(ref=ref), Image.open(config['OUTPUT'] / filename) as image:
                self.assertEqual(config['LINKS'][filename], expected)
                self.assertEqual(image.size, (1000, 1000))
                self.assertEqual(image.format, 'PNG')
                decoded = zxingcpp.read_barcode(image)
                self.assertIsNotNone(decoded)
                self.assertEqual(decoded.text, expected)
                self.assertEqual(decoded.ec_level, 'H')

    def test_abdo_qr_is_unchanged(self):
        path = config['OUTPUT'] / 'QR_MOHAMED_ABDO_STATIC.png'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         '80f0b5e9b3ffe9235b77413d1bfa3d437bd948b0d08a44d9c6d47983d5a227e9')
        with Image.open(path) as image:
            self.assertEqual(zxingcpp.read_barcode(image).text,
                             'https://turkluxx.com/?ref=MOHAMED&subref=MOHAMED_ABDO&lang=ar')


if __name__ == '__main__':
    unittest.main()
