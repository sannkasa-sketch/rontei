import { expect, test } from "@playwright/test";
import { buildTopicsHref, clampPage, parsePositivePage, topicsPageSize } from "../../lib/topics-list";

test("議題一覧のページ計算とURL状態を安全に扱う", () => {
  expect(topicsPageSize).toBe(30);
  expect(parsePositivePage("0")).toBe(1);
  expect(parsePositivePage("abc")).toBe(1);
  expect(clampPage(999999, 61)).toBe(3);
  expect(buildTopicsHref(2, "technology", "new")).toBe("/topics?sort=new&category=technology&page=2");
});
