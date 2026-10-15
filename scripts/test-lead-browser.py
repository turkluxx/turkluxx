"""Browser checks against `npm run dev`; requires the local Playwright Python test tool.
No remote bindings or real email delivery. Run: python scripts/test-lead-browser.py
"""
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8787'
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for referral, page_path, selection, expected in [
        ('DIRECT', '/', None, (None, None, None)),
        ('ALMA', '/rengi-istanbul.html', ('5+1', 'emerald'), ('Rengi Istanbul', 'Z\u00fcmr\u00fct (Emerald)', 'B3-AG')),
        ('MOHAMED', '/rengi-antalya.html', 'greenlife', ('Rengi Antalya', 'GreenLife', None)),
        ('VLAD', '/rengi-istanbul.html', ('5+1', 'emerald'), ('Rengi Istanbul', 'Z\u00fcmr\u00fct (Emerald)', 'B3-AG')),
    ]:
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        page.goto(BASE + '/' + (f'?ref={referral}' if referral != 'DIRECT' else ''), wait_until='domcontentloaded')
        if page_path != '/':
            page.goto(BASE + page_path + ('?ref=ALMA' if referral == 'VLAD' else ''), wait_until='domcontentloaded')
        if isinstance(selection, tuple):
            category, variant = selection
            page.locator(f'[data-category="{category}"]').click()
            page.locator(f'input[value="{variant}"]').check()
        elif selection:
            page.locator(f'[data-project="{selection}"]').click()
        opener = '.rengi-villa-contact' if selection else '.turkluxx-callback-trigger:visible'
        page.locator(opener).first.click()
        for key, value in [('name', 'Sarah Williams'), ('phone', '+44 20 1234 5678'), ('email', 'sarah@example.com')]:
            page.locator('#callback-' + key).fill(value)
        with page.expect_response(lambda r: r.url.endswith('/api/lead')) as pending:
            page.locator('.turkluxx-callback-submit').click()
        response = pending.value
        assert response.status == 200, response.text()
        payload = response.request.post_data_json
        assert payload['referral'] == referral
        assert tuple(payload[k] for k in ['project', 'property', 'propertyCode']) == expected
        page.wait_for_function("document.querySelector('#turkluxx-callback [role=status]').textContent.includes('Thank you')")
        if selection:
            page.keyboard.press('Escape'); page.wait_for_timeout(220)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.locator('.turkluxx-mobile-callback-trigger').click()
            generic = page.evaluate("buildTurkLuxxLeadPayload(document.querySelector('#turkluxx-callback-form'))")
            assert all(generic[k] is None for k in ['project', 'property', 'propertyCode'])
        print(referral, 'passed: local Worker response, payload context, first-touch and generic reset')
        context.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.goto(BASE, wait_until='domcontentloaded')
    page.locator('.turkluxx-callback-trigger:visible').first.click()
    for key, value in [('name', 'Sarah Williams'), ('phone', '+44 20 1234 5678'), ('email', 'sarah@example.com')]:
        page.locator('#callback-' + key).fill(value)
    held = []
    page.route('**/api/lead', lambda route: held.append(route))
    page.locator('.turkluxx-callback-submit').click()
    page.wait_for_timeout(100)
    page.evaluate("document.querySelector('#turkluxx-callback-form').requestSubmit(); document.querySelector('#turkluxx-callback-form').requestSubmit()")
    page.wait_for_timeout(100)
    assert len(held) == 1
    assert page.locator('.turkluxx-callback-submit').is_disabled()
    assert 'Thank you' not in page.locator('#turkluxx-callback [role=status]').inner_text()
    held.pop().fulfill(status=502, content_type='application/json', body='{"ok":false,"error":"Unavailable"}')
    page.wait_for_function("!document.querySelector('.turkluxx-callback-submit').disabled")
    assert 'could not confirm' in page.locator('#turkluxx-callback [role=status]').inner_text()
    assert page.locator('#callback-name').input_value() == 'Sarah Williams'
    assert page.locator('#callback-email').input_value() == 'sarah@example.com'
    page.locator('.turkluxx-callback-submit').click(); page.wait_for_timeout(100)
    assert len(held) == 1
    held.pop().fulfill(status=200, content_type='application/json', body='{"ok":true,"leadId":"TEST"}')
    page.wait_for_function("document.querySelector('#turkluxx-callback [role=status]').textContent.includes('Thank you')")
    print('J/K passed: one request while pending, failure never shows success, data retained, retry succeeds')
    page.locator('.turkluxx-callback-submit').click(); page.wait_for_timeout(100)
    page.keyboard.press('Escape'); page.wait_for_timeout(220)
    page.locator('.turkluxx-callback-trigger:visible').first.click()
    held.pop().fulfill(status=200, content_type='application/json', body='{"ok":true}')
    page.wait_for_function("!document.querySelector('.turkluxx-callback-submit').disabled")
    assert page.locator('#turkluxx-callback [role=status]').inner_text() == ''
    print('Late response cannot alter a newly opened modal')
    context.close(); browser.close()
