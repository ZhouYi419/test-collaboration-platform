from dataclasses import dataclass, field
from typing import Literal

from playwright.sync_api import Page, expect


@dataclass(frozen=True)
class Site:
    url: str
    password: str = field(repr=False)


DESCRIPTION = "回归测试使用的事项描述"


def log_in(page: Page, site: Site, role: Literal["tester", "developer"]):
    page.set_default_timeout(10_000)
    page.goto(f"{site.url}/login")
    page.get_by_label("用户名或邮箱", exact=True).fill(f"e2e-{role}")
    page.get_by_label("密码", exact=True).fill(site.password)
    page.get_by_role("button", name="登录", exact=True).click()
    section = "我的事项" if role == "tester" else "开发事项"
    page.get_by_role("navigation", name="工作区导航").get_by_role("link", name=section, exact=True).click()
    expect(page.get_by_role("heading", name=section, exact=True)).to_be_visible()


def create_issue(page: Page, title: str, kind: Literal["Bug 修复", "需求"], *, assign=False):
    page.get_by_role("link", name="新建事项", exact=True).click()
    page.get_by_role("radio", name=kind, exact=True).check()
    page.get_by_label("标题").fill(title)
    page.get_by_label("详细描述").fill(DESCRIPTION)
    page.get_by_label("优先级").select_option("P1")
    if kind == "Bug 修复":
        page.get_by_label("发生环境").select_option("uat")
        page.get_by_label("严重程度").select_option("严重")
        page.get_by_label("复现步骤").fill("筛选后点击导出")
        page.get_by_label("实际结果").fill("文件没有内容")
        page.get_by_label("预期结果").fill("导出筛选后的记录")
    else:
        page.get_by_label("需求背景").fill("用例需要引用同一事项")
        page.get_by_label("期望效果").fill("复制事项链接")
        page.get_by_label("验收标准").fill("粘贴的链接能重新打开事项")
    if assign:
        page.get_by_label("指定开发", exact=True).select_option(label="e2e-developer")
    page.get_by_role("button", name="提交事项", exact=True).click()
    open_issue(page, title)


def open_issue(page: Page, title: str, *, queue: str | None = None):
    if queue:
        navigation = page.get_by_role("navigation", name="工作区导航")
        navigation.get_by_role("link", name="开发事项", exact=True).click()
        page.get_by_role("navigation", name="开发事项分类").get_by_role("link", name=queue, exact=True).click()
    page.get_by_role("link", name=title, exact=True).click()
    expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()


def expect_status(page: Page, status: str):
    expect(page.locator(".detail-head .issue-state")).to_have_text(status)


def submit_feedback(page: Page, feedback: str):
    page.get_by_label("处理说明").fill(feedback)
    page.get_by_role("button", name="提交处理结果", exact=True).click()
    expect_status(page, "待验证")


def close_issue(page: Page):
    page.get_by_role("button", name="通过并关闭", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="确认关闭", exact=True).click()
    expect_status(page, "已关闭")


def show_history(page: Page):
    page.locator("summary").filter(has_text="处理与验证历史").click()
    return page.locator(".history-rounds").get_by_role("listitem")
