import { describe, expect, it, vi } from "vitest";
import { useLanguageSetting } from "./useLanguageSetting";

function setup(put: (lang: "vi" | "en") => Promise<unknown>) {
  const reload = vi.fn();
  const remember = vi.fn();
  const onError = vi.fn();
  const setting = useLanguageSetting({ current: "vi", put, remember, reload, onError });
  return { setting, reload, remember, onError };
}

describe("useLanguageSetting", () => {
  it("starts on the current language, with nothing to save", () => {
    const { setting } = setup(vi.fn());
    expect(setting.chosen.value).toBe("vi");
    expect(setting.changed.value).toBe(false);
  });

  it("sends the language once, then remembers it and reloads", async () => {
    const put = vi.fn().mockResolvedValue({ language: "en" });
    const { setting, reload, remember } = setup(put);
    setting.chosen.value = "en";
    expect(setting.changed.value).toBe(true);
    await setting.save();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("en");
    expect(remember).toHaveBeenCalledWith("en");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload or remember when the request fails, and reports the error", async () => {
    const put = vi.fn().mockRejectedValue(new Error("boom"));
    const { setting, reload, remember, onError } = setup(put);
    setting.chosen.value = "en";
    await setting.save();
    expect(reload).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("boom");
    expect(setting.saving.value).toBe(false);
  });

  it("sends nothing when the language did not change", async () => {
    const put = vi.fn();
    const { setting, reload } = setup(put);
    await setting.save();
    expect(put).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("sends nothing twice while a save is running", async () => {
    let finish: (v: unknown) => void = () => {};
    const put = vi.fn().mockReturnValue(new Promise((r) => (finish = r)));
    const { setting } = setup(put);
    setting.chosen.value = "en";
    const first = setting.save();
    await setting.save();
    finish({});
    await first;
    expect(put).toHaveBeenCalledTimes(1);
  });
});
