from playwright.sync_api import expect

from issue_steps import close_issue, create_issue, expect_status, log_in, open_issue, show_history, submit_feedback


def test_assigned_bug_is_closed_by_its_reporter(new_context, live_site):
    tester = new_context().new_page()
    developer = new_context().new_page()
    title = "导出丢失记录"
    feedback = "导出时保留了筛选后的记录"
    log_in(tester, live_site, "tester")
    create_issue(tester, title, "Bug 修复", assign=True)
    expect_status(tester, "待处理")

    log_in(developer, live_site, "developer")
    open_issue(developer, title, queue="我的待办")
    developer.get_by_role("button", name="开始处理", exact=True).click()
    expect_status(developer, "处理中")
    submit_feedback(developer, feedback)

    tester.reload()
    expect_status(tester, "待验证")
    expect(tester.get_by_text(feedback, exact=True)).to_be_visible()
    close_issue(tester)
    tester.reload()
    expect_status(tester, "已关闭")
    expect(tester.get_by_role("button", name="通过并关闭", exact=True)).to_have_count(0)
    open_issue(developer, title, queue="已反馈")
    expect_status(developer, "已关闭")


def test_claimed_request_is_returned_reworked_and_closed(new_context, live_site):
    tester = new_context().new_page()
    developer = new_context().new_page()
    title = "支持复制事项链接"
    feedback = "添加了复制事项链接按钮"
    reason = "复制结果缺少查询参数"
    revised_feedback = "复制链接时保留查询参数"
    log_in(tester, live_site, "tester")
    create_issue(tester, title, "需求")
    expect_status(tester, "待领取")

    log_in(developer, live_site, "developer")
    open_issue(developer, title, queue="待领取")
    developer.get_by_role("button", name="领取事项", exact=True).click()
    developer.get_by_role("dialog").get_by_role("button", name="确认领取", exact=True).click()
    expect_status(developer, "待处理")
    developer.get_by_role("button", name="开始处理", exact=True).click()
    submit_feedback(developer, feedback)

    tester.reload()
    tester.get_by_role("button", name="验证不通过", exact=True).click()
    tester.get_by_label("退回原因").fill(reason)
    tester.get_by_role("button", name="退回开发", exact=True).click()
    expect_status(tester, "处理中")

    open_issue(developer, title, queue="我的待办")
    expect(developer.get_by_text(reason, exact=True)).to_be_visible()
    submit_feedback(developer, revised_feedback)
    tester.reload()
    expect(tester.get_by_text(revised_feedback, exact=True)).to_be_visible()
    close_issue(tester)
    rounds = show_history(tester)
    expect(rounds).to_have_count(2)
    first = rounds.filter(has=tester.get_by_role("heading", name="第 1 轮", exact=True))
    second = rounds.filter(has=tester.get_by_role("heading", name="第 2 轮", exact=True))
    expect(first).to_contain_text(feedback)
    expect(first).to_contain_text(reason)
    expect(second).to_contain_text(revised_feedback)
    expect(second.locator("[data-outcome]")).to_have_attribute("data-outcome", "passed")
