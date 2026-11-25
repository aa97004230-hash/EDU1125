"use strict";

const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const workbookMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xmlText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function worksheetRow(index, cells, height) {
  const rowHeight = height ? ` ht="${height}" customHeight="1"` : "";
  const columns = ["A", "B"];
  const cellXml = cells.map(([value, style = 0], column) => {
    const address = `${columns[column]}${index}`;
    return typeof value === "number"
      ? `<c r="${address}" s="${style}"><v>${value}</v></c>`
      : `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  });
  return `<row r="${index}"${rowHeight}>${cellXml.join("")}</row>`;
}

function expenseSheet(result) {
  const rows = [
    { cells: [["예상 출장여비", 1]], height: 24 },
    { cells: [["예상 총액 (원)", 1], [result.total, 4]] },
    { cells: [["출장일"], [result.departure]] },
    { cells: [["복귀일"], [result.returnDate]] },
    { cells: [["출장 정보"], [result.context]] },
    { cells: [] },
    { cells: [["지급 항목", 2], ["금액 (원)", 2]], height: 21 },
    ...result.rows.map(([label, value]) => ({ cells: [[label], [value, 3]] })),
    ...result.notes.map((note, index) => ({ cells: [[index === 0 ? "적용 조건" : ""], [note, 5]], height: 44 })),
    { cells: [["계산 기준"], ["공무원 여비 규정(대통령령 제36728호, 2026. 10. 2. 시행)", 5]], height: 29 },
  ];
  return `<worksheet xmlns="${spreadsheetNamespace}">
    <cols><col min="1" max="1" width="37" customWidth="1"/><col min="2" max="2" width="72" customWidth="1"/></cols>
    <sheetData>${rows.map(({ cells, height }, index) => worksheetRow(index + 1, cells, height)).join("")}</sheetData>
  </worksheet>`;
}

function createExpenseWorkbook(result) {
  const zip = new JSZip();
  const parts = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    </Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageRelationships}">
      <Relationship Id="rId1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${officeRelationships}">
      <sheets><sheet name="출장여비" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageRelationships}">
      <Relationship Id="rId1" Type="${officeRelationships}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${officeRelationships}/styles" Target="styles.xml"/>
    </Relationships>`,
    "xl/worksheets/sheet1.xml": expenseSheet(result),
    "xl/styles.xml": `<styleSheet xmlns="${spreadsheetNamespace}">
      <fonts count="2">
        <font><sz val="11"/><name val="Malgun Gothic"/></font>
        <font><b/><sz val="11"/><name val="Malgun Gothic"/></font>
      </fonts>
      <fills count="3">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFE7EFFF"/><bgColor indexed="64"/></patternFill></fill>
      </fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="6">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
        <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
        <xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`,
  };
  for (const [name, contents] of Object.entries(parts)) {
    zip.file(name, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${contents}`);
  }
  return zip.generateAsync({ type: "blob", mimeType: workbookMime });
}
