"use strict";

const form = document.querySelector("#trip-form");
const get = (id) => document.getElementById(id);
const lodgings = get("lodgings");
const won = new Intl.NumberFormat("ko-KR");
const dayMs = 86_400_000;
const dailyRate = 25_000;
const lodgingCaps = { seoul: 100_000, metro: 80_000, other: 70_000 };
const lodgingNames = { seoul: "서울특별시", metro: "광역시", other: "그 밖의 지역" };
const stayBands = [
  { first: 1, last: 16, label: "1~16일차", rate: 1 },
  { first: 17, last: 31, label: "17~31일차", rate: 0.9 },
  { first: 32, last: 61, label: "32~61일차", rate: 0.8 },
  { first: 62, last: Infinity, label: "62일차 이후", rate: 0.7 },
];
const fareRules = {
  paid: ["지급 대상 운임 합계", "할인 적용 후 지급 대상인 왕복 운임을 입력하세요. 철도는 제1호 특실·제2호 일반실, 선박은 제1호 1등급·제2호 2등급 기준입니다. 항공 등급은 기관 기준을 적용하세요."],
  personal: ["철도 또는 버스 기준 왕복 운임", "해당 구간의 지급 구분에 맞는 철도 또는 버스 운임을 입력하세요."],
  unavoidable: ["지급 대상 연료비·통행료 등 합계", "소속 기관 기준으로 산정한 연료비·통행료 등의 합계를 입력하세요."],
  "mixed-vehicle": ["유료 교통편의 지급 대상 운임 합계", "공무용 차량 외에 이용한 유료 교통편의 지급 대상 운임을 입력하세요."],
};
const regularRows = [["운임", null], ["일비", null], ["숙박비", null], ["식비", null]];
let currentResult = null;

const insideTrip = () => form.elements["trip-type"].value === "inside";
const actualGroup = () => get("group").value === "actual";
const inclusiveDays = () => (get("return-date").valueAsNumber - get("departure").valueAsNumber) / dayMs + 1;
const bandDays = (days, band) => Math.max(0, Math.min(days, band.last) - band.first + 1);
const amount = (value) => `${won.format(value)}원`;

for (const band of stayBands) {
  const label = document.createElement("label");
  label.className = "field";
  label.append(band.label);
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.placeholder = "0";
  input.inputMode = "numeric";
  label.append(input);
  get("stay-bands").append(label);
  band.field = label;
  band.input = input;
}

function syncFields() {
  const inside = insideTrip();
  const method = get("transport").value;
  const actual = actualGroup();
  const fareRule = fareRules[method];
  const days = inclusiveDays();
  const longStay = get("long-stay").checked && !actual;
  const mixedHalf = method === "mixed-vehicle" || get("other-half").checked;
  const bandsNeeded = longStay && mixedHalf && method !== "official-vehicle" && days > 16;
  get("inside-fields").hidden = !inside;
  get("outside-fields").hidden = inside;
  get("actual-fields").hidden = !actual;
  get("fare-field").hidden = !fareRule;
  get("fare-hint").hidden = !fareRule;
  if (fareRule) {
    get("fare-label").textContent = fareRule[0];
    get("fare-hint").textContent = fareRule[1];
  }
  get("other-half-field").hidden = actual || ["official-vehicle", "mixed-vehicle"].includes(method);
  get("half-days-field").hidden = actual || method === "official-vehicle" || !mixedHalf || bandsNeeded;
  get("stay-half-fields").hidden = !bandsNeeded;
  get("long-stay-field").hidden = actual;
  get("long-stay-hint").hidden = !longStay;
  for (const band of stayBands) {
    band.field.hidden = !bandsNeeded || !bandDays(days, band);
    band.input.max = Number.isFinite(days) ? String(bandDays(days, band)) : "0";
  }
  get("meal-excluded-field").hidden = actual;
  get("mileage-field").hidden = actual;
  const savedWithMiles = !actual && Number(get("mileage-saving").value) > 0;
  get("mileage-days-field").hidden = !savedWithMiles;
  get("mileage-hint").hidden = !savedWithMiles;
  get("no-lodging").hidden = lodgings.childElementCount > 0;
  [...lodgings.children].forEach((row, index) => {
    row.querySelector("legend").textContent = `숙박 ${index + 1}`;
    row.querySelector("button").setAttribute("aria-label", `숙박 ${index + 1} 삭제`);
    const cap = lodgingCaps[row.querySelector('[data-field="region"]').value];
    const hasExtra = get("group").value === "2" && Number(row.querySelector('[data-field="price"]').value) > cap;
    row.querySelector(".lodging-extra").hidden = !hasExtra;
  });
}

class InputError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function integer(field, label, { min = 0, max = 999_999_999, optional = false } = {}) {
  if (optional && !field.value && !field.validity.badInput) return 0;
  const value = field.valueAsNumber;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new InputError(field, `${label}에 ${won.format(min)}~${won.format(max)} 사이의 정수를 입력하세요.`);
  }
  return value;
}

function selected(field, message) {
  if (!field.value) throw new InputError(field, message);
  return field.value;
}

function lodgingCosts(days, group) {
  let nights = 0;
  let base = 0;
  let extra = 0;
  const cappedRegions = new Set();
  for (const row of lodgings.children) {
    const field = (name) => row.querySelector(`[data-field="${name}"]`);
    const region = selected(field("region"), "숙박 지역을 선택하세요.");
    if (nights >= days - 1) {
      throw new InputError(field("nights"), "전체 숙박 박수는 출장 기간의 날짜 차이를 넘을 수 없습니다. 당일 출장은 숙박 항목을 삭제하세요.");
    }
    const count = integer(field("nights"), "숙박 박수", { min: 1, max: days - 1 - nights });
    const price = integer(field("price"), "1박 실제 결제액");
    const cap = group === "2" ? lodgingCaps[region] : price;
    nights += count;
    base += Math.min(price, cap) * count;
    if (price > cap) {
      cappedRegions.add(`${lodgingNames[region]} ${amount(cap)}`);
      if (field("exception").checked) extra += Math.min(price - cap, cap * 0.3) * count;
    }
  }
  return { nights, base, extra, cappedRegions };
}

function calculateDaily(days, method) {
  const allHalf = method === "official-vehicle";
  const partialHalf = method === "mixed-vehicle" || get("other-half").checked;
  const longStay = get("long-stay").checked && days > 16;
  if (!longStay) {
    const half = allHalf ? days : partialHalf ? integer(get("half-days"), "일비 감액 적용일수", { max: days }) : 0;
    return { value: dailyRate * days - dailyRate / 2 * half, half, longStay };
  }
  let half = 0;
  let value = 0;
  for (const band of stayBands) {
    const count = bandDays(days, band);
    if (!count) continue;
    const reduced = allHalf ? count : partialHalf ? integer(band.input, band.label + " 반액 적용일수", { optional: true, max: count }) : 0;
    half += reduced;
    value += dailyRate * band.rate * (count - reduced / 2);
  }
  return { value, half, longStay };
}

function estimatedExpenses() {
  selected(get("departure"), "출장일을 입력하세요.");
  selected(get("return-date"), "복귀일을 입력하세요.");
  for (const field of [get("departure"), get("return-date")]) {
    if (!Number.isFinite(field.valueAsNumber) || field.valueAsNumber > Date.UTC(9999, 11, 31)) {
      throw new InputError(field, "연도가 네 자리인 날짜를 입력하세요.");
    }
  }
  const days = inclusiveDays();
  if (days < 1) throw new InputError(get("return-date"), "복귀일은 출장일과 같거나 이후여야 합니다.");
  const notes = [];
  if (get("departure").valueAsNumber < Date.UTC(2026, 9, 2)) {
    notes.push("입력한 출장일이 첨부 규정 시행일인 2026년 10월 2일보다 이릅니다. 해당 출장일의 적용 규정을 확인하세요.");
  }
  if (insideTrip()) {
    const hours = selected(get("hours"), "근무지 내 출장시간 구간을 선택하세요.");
    const vehicle = get("inside-vehicle").value;
    const base = hours === "long" ? 20_000 : 10_000;
    const value = vehicle === "assigned" ? 0 : base - (vehicle === "official" ? 10_000 : 0);
    if (vehicle === "assigned") notes.push("전용 차량 배정자는 근무지 내 출장여비 지급 대상에서 제외됩니다.");
    if (vehicle === "official") notes.push("공무용 차량 이용 등 해당 조건에 따라 근무지 내 출장여비에서 10,000원을 감액했습니다.");
    if (days > 1) notes.push("입력한 시간 구간을 한 건의 출장에 적용했습니다. 날짜별 별도 출장은 각각 계산하세요.");
    return { rows: [["근무지 내 출장여비", value]], context: `근무지 내 출장 · ${hours === "long" ? "4시간 이상" : "4시간 미만"}`, notes };
  }

  const group = selected(get("group"), "여비 지급 구분을 선택하세요.");
  const method = selected(get("transport"), "이동 방법을 선택하세요.");
  const fare = fareRules[method] ? integer(get("fare"), fareRules[method][0]) : 0;
  const lodging = lodgingCosts(days, group);
  let daily;
  let meal;
  let mileage = 0;
  if (group === "actual") {
    daily = integer(get("actual-daily"), "지급 대상 일비 실비 합계");
    meal = integer(get("actual-meal"), "지급 대상 식비 실비 합계");
    notes.push("대통령·국무총리의 일비와 식비는 입력한 지급 대상 실비를 적용했습니다.");
  } else {
    const mealExcluded = integer(get("meal-excluded"), "별도 식비가 필요 없었던 날", { optional: true, max: days });
    const dailyResult = calculateDaily(days, method);
    daily = dailyResult.value;
    meal = dailyRate * (days - mealExcluded);
    if (dailyResult.half) notes.push(`${dailyResult.half}일에 공무용 차량 이용 등에 따른 일비 반액을 적용했습니다.`);
    if (dailyResult.longStay) notes.push("제17조에 따른 동일 지역 장기 체재 일비 감액을 적용했습니다.");
    if (mealExcluded) notes.push(`별도 식비가 필요 없었던 선박·항공 여행일 ${mealExcluded}일의 식비를 제외했습니다.`);
    const savings = integer(get("mileage-saving"), "공적 항공마일리지 절약 운임", { optional: true });
    if (savings) {
      const mileageDays = integer(get("mileage-days"), "마일리지 추가 일비 지급 대상 일수", { min: 1, max: days });
      mileage = Math.min(savings, dailyRate / 2 * mileageDays);
      notes.push("마일리지 추가 일비는 대상 일수의 기본 일비 50%를 적용하며, 절약한 운임 범위로 제한했습니다. 기관 세부 기준을 확인하세요.");
    }
  }
  if (lodging.cappedRegions.size) notes.push(`1박 숙박비 상한을 적용했습니다. ${[...lodging.cappedRegions].join(" · ")}`);
  if (lodging.extra) notes.push("숙박비 상한 초과분은 별도 정산 항목입니다. 국내 출장은 종료 다음 날부터 1주 이내 카드 증빙을 갖춰 신청해야 합니다.");
  const rows = [["운임", fare], ["일비", daily], ["숙박비", lodging.base], ["식비", meal]];
  if (mileage) rows.push(["공적 항공마일리지 추가 일비", mileage]);
  if (lodging.extra) rows.push(["숙박비 추가 정산 예상액", lodging.extra]);
  return { rows, context: `근무지 외 출장 · ${won.format(days)}일 · 숙박 ${won.format(lodging.nights)}박`, notes };
}

function renderResult(rows, context, notes = []) {
  const calculated = rows[0][1] !== null;
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  currentResult = calculated ? {
    rows, context, notes, total,
    departure: get("departure").value,
    returnDate: get("return-date").value,
  } : null;
  get("total").value = calculated ? won.format(total) : "—";
  get("result-context").textContent = context;
  const dates = get("result-dates");
  dates.hidden = !calculated;
  dates.textContent = calculated ? `${currentResult.departure} ~ ${currentResult.returnDate}` : "";
  get("result-actions").hidden = !calculated;
  get("export-error").hidden = true;
  get("breakdown").replaceChildren(...rows.map(([label, value]) => {
    const line = document.createElement("div");
    const name = document.createElement("dt");
    const cost = document.createElement("dd");
    name.textContent = label;
    cost.textContent = value === null ? "—" : amount(value);
    line.append(name, cost);
    return line;
  }));
  get("result-notes").hidden = notes.length === 0;
  get("result-notes").replaceChildren(...notes.map((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    return item;
  }));
}

function clearFeedback() {
  get("form-error").hidden = true;
  form.querySelector('[aria-invalid="true"]')?.removeAttribute("aria-invalid");
  if (currentResult) {
    renderResult(regularRows, "입력 내용이 바뀌었습니다. 여비를 다시 계산하세요.");
  }
}

function addLodging() {
  lodgings.append(get("lodging-template").content.cloneNode(true));
  syncFields();
  return lodgings.lastElementChild;
}

form.noValidate = true;
form.addEventListener("input", () => {
  clearFeedback();
  syncFields();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFeedback();
  try {
    const { rows, context, notes } = estimatedExpenses();
    renderResult(rows, context, notes);
    if (window.matchMedia("(max-width: 790px)").matches) {
      get("result-title").scrollIntoView({ block: "start" });
    }
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    const details = error.field.closest("details");
    if (details) details.open = true;
    get("form-error").textContent = error.message;
    get("form-error").hidden = false;
    error.field.setAttribute("aria-invalid", "true");
    error.field.focus();
  }
});
form.addEventListener("reset", () => {
  lodgings.replaceChildren();
  form.querySelector("details").open = false;
  clearFeedback();
  queueMicrotask(() => {
    syncFields();
    renderResult(regularRows, "출장 정보를 입력하고 여비를 계산하세요.");
  });
});
get("add-lodging").addEventListener("click", () => {
  clearFeedback();
  addLodging().querySelector("select").focus();
});
get("print-result").addEventListener("click", () => {
  if (currentResult) window.print();
});
get("save-excel").addEventListener("click", async (event) => {
  const result = currentResult;
  if (!result) return;
  const button = event.currentTarget;
  const errorMessage = get("export-error");
  button.disabled = true;
  errorMessage.hidden = true;
  try {
    const workbook = await createExpenseWorkbook(result);
    if (currentResult !== result) return;
    const url = URL.createObjectURL(workbook);
    const link = document.createElement("a");
    link.href = url;
    link.download = `출장여비_${result.departure}_${result.returnDate}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    if (currentResult === result) {
      errorMessage.textContent = "엑셀 파일을 만들 수 없습니다. 다시 시도해 주세요.";
      errorMessage.hidden = false;
    }
    console.error(error);
  } finally {
    button.disabled = false;
  }
});
lodgings.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-lodging");
  if (!button) return;
  button.closest("fieldset").remove();
  clearFeedback();
  syncFields();
  get("add-lodging").focus();
});
get("sample").addEventListener("click", () => {
  form.reset();
  queueMicrotask(() => {
    get("departure").value = "2026-11-25";
    get("return-date").value = "2026-11-26";
    get("group").value = "2";
    get("transport").value = "paid";
    get("fare").value = "60000";
    const lodging = addLodging();
    lodging.querySelector('[data-field="region"]').value = "metro";
    lodging.querySelector('[data-field="price"]').value = "90000";
    syncFields();
    form.requestSubmit();
  });
});
get("open-guide").addEventListener("click", () => {
  get("guide-dialog").showModal();
});

syncFields();
