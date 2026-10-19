"""Optional standalone utility tests. No saved QR artifacts are required."""
from pathlib import Path
import runpy
import tempfile
import unittest

from PIL import Image
import zxingcpp

config = runpy.run_path(str(Path(__file__).with_name('generate-referral-qr.py')))


class ReferralQRTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='turkluxx-qr-test-')
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / 'qr_codes'

    def test_registered_referral_artifacts(self):
        self.assertEqual(config['OUTPUT'], config['ROOT'] / 'generated' / 'qr_codes')
        self.assertFalse(self.output.exists())
        config['main'](self.output)
        self.assertEqual(len(config['LINKS']), 5)
        for ref in ['AHMAD', 'ALMA', 'VLAD', 'MOHAMED', 'TIM_BOND']:
            filename = f'QR_{ref}_STATIC.png'
            language = 'nl' if ref == 'TIM_BOND' else 'en'
            expected = f'https://turkluxx.com/?ref={ref}&lang={language}'
            with self.subTest(ref=ref), Image.open(self.output / filename) as image:
                self.assertEqual(config['LINKS'][filename], expected)
                self.assertEqual(image.size, (1000, 1000))
                self.assertEqual(image.format, 'PNG')
                decoded = zxingcpp.read_barcode(image)
                self.assertIsNotNone(decoded)
                self.assertEqual(decoded.text, expected)
                self.assertEqual(decoded.ec_level, 'H')

    def test_unrelated_deliverables_are_untouched(self):
        self.output.mkdir()
        path = self.output / 'QR_MOHAMED_ABDO_STATIC.png'
        path.write_bytes(b'unrelated standalone deliverable')
        config['main'](self.output)
        self.assertEqual(path.read_bytes(), b'unrelated standalone deliverable')


if __name__ == '__main__':
    unittest.main()
