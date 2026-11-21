import pytest
from playwright.sync_api import expect

from issue_steps import create_issue, expect_status, log_in, open_issue, show_history, submit_feedback


@pytest.mark.browser_context_args(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
def test_narrow_return_validates_input_and_opens_history(new_context, live_site):
    tester = new_context().new_page()
    developer = new_context().new_page()
    title = "窄屏验证复现"
    feedback = "调整了事项表单布局"
    reason = "退回原因要在窄屏详情中完整显示"
    log_in(tester, live_site, "tester")
    create_issue(tester, title, "Bug 修复", assign=True)
    expect(tester.locator("html")).to_have_js_property("scrollWidth", 390)

    log_in(developer, live_site, "developer")
    open_issue(developer, title, queue="我的待办")
    developer.get_by_role("button", name="开始处理", exact=True).click()
    submit_feedback(developer, feedback)

    tester.reload()
    tester.get_by_role("button", name="验证不通过", exact=True).click()
    cause = tester.get_by_label("退回原因")
    expect(cause).to_be_focused()
    tester.get_by_role("button", name="退回开发", exact=True).click()
    expect(tester.get_by_text("请填写退回原因", exact=True)).to_be_visible()
    expect(cause).to_be_focused()
    expect_status(tester, "待验证")
    expect(tester.locator("html")).to_have_js_property("scrollWidth", 390)

    cause.fill(reason)
    tester.get_by_role("button", name="退回开发", exact=True).click()
    expect_status(tester, "处理中")
    rounds = show_history(tester)
    expect(rounds).to_have_count(1)
    expect(rounds).to_contain_text(reason)
    expect(tester.locator("html")).to_have_js_property("scrollWidth", 390)
