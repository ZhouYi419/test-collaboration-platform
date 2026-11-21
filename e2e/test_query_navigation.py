from playwright.sync_api import expect

from issue_steps import DESCRIPTION, create_issue, expect_status, log_in, open_issue


def test_query_and_detail_preserve_filters(page, live_site):
    keyword = "查询演示"
    title = f"{keyword}需求"
    log_in(page, live_site, "tester")
    for issue_title, kind in [(title, "需求"), (f"{keyword}缺陷", "Bug 修复"), ("其他需求", "需求")]:
        create_issue(page, issue_title, kind)
        page.get_by_role("navigation", name="工作区导航").get_by_role("link", name="我的事项", exact=True).click()

    query = page.get_by_role("form", name="查询事项")
    query.get_by_label("关键词", exact=True).fill(keyword)
    query.get_by_label("类型", exact=True).select_option(label="需求")
    query.get_by_role("button", name="查询", exact=True).click()
    rows = page.get_by_role("table", name="我的事项").get_by_role("rowheader")
    expect(rows).to_have_text([title])
    open_issue(page, title)
    expect_status(page, "待领取")
    expect(page.get_by_text(DESCRIPTION, exact=True)).to_be_visible()
    page.locator(".back-link").click()
    expect(query.get_by_label("关键词", exact=True)).to_have_value(keyword)
    expect(query.get_by_label("类型", exact=True)).to_have_value("request")
    expect(rows).to_have_text([title])
