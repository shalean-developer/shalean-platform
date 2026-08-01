# Google Drive Management Sync

## Purpose

This integration exposes a read-only monthly management KPI feed for the Shalean Google Drive management workbook.

## Endpoint

`GET /api/reporting/management-dashboard?month=YYYY-MM`

Required header:

`X-Reporting-Token: <MANAGEMENT_REPORTING_TOKEN>`

The endpoint:

- uses the existing Office finance source-of-truth loader;
- returns operational booking counts, recurring work, reviews and pending applications;
- never accepts writes;
- disables caching;
- returns no customer, cleaner, banking or payment-reference personal data.

## Required staging environment variable

Create a high-entropy secret named:

`MANAGEMENT_REPORTING_TOKEN`

Add it to **staging/preview only** for verification. Do not add it to production until the staging reconciliation is approved.

## Google Apps Script

Paste this into the Google Sheet under **Extensions → Apps Script**:

```javascript
function refreshShaleanKPIs() {
  const props = PropertiesService.getScriptProperties();
  const endpoint = props.getProperty('SHALEAN_REPORTING_ENDPOINT');
  const token = props.getProperty('SHALEAN_REPORTING_TOKEN');
  const month = Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyy-MM');

  if (!endpoint || !token) throw new Error('Missing Shalean connector settings');

  const response = UrlFetchApp.fetch(endpoint + '?month=' + encodeURIComponent(month), {
    method: 'get',
    headers: { 'X-Reporting-Token': token },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Shalean reporting request failed: ' + response.getContentText());
  }

  const payload = JSON.parse(response.getContentText());
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName('Live KPI Data');
  const rows = payload.metrics.map(metric => [
    metric.label,
    metric.value,
    payload.generated_at,
    metric.source,
    metric.unit,
  ]);

  const existingRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 1, existingRows, 5).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 5).setValues(rows);

  PropertiesService.getDocumentProperties().setProperty('LAST_SUCCESSFUL_SYNC', payload.generated_at);
}

function installShaleanHourlySync() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'refreshShaleanKPIs')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('refreshShaleanKPIs')
    .timeBased()
    .everyHours(1)
    .create();

  refreshShaleanKPIs();
}
```

Set Script Properties:

- `SHALEAN_REPORTING_ENDPOINT`: staging URL ending in `/api/reporting/management-dashboard`
- `SHALEAN_REPORTING_TOKEN`: the same staging secret

Run `installShaleanHourlySync()` once and approve Google permissions.

## Staging acceptance checks

1. Request without token returns 401.
2. Invalid month returns 400.
3. Valid request returns no PII.
4. Revenue, cleaner earnings, expenses and net profit reconcile with `/office` for the same period.
5. Completed and cancelled booking counts reconcile with the production/staging audit query.
6. The Google Sheet refresh updates only `Live KPI Data`.
7. Manual meeting, action, risk, quality and recruitment tabs remain unchanged.
8. Trigger produces only one hourly job and does not duplicate triggers.

## Production gate

Do not merge or configure production until:

- staging deployment is healthy;
- July known totals reconcile;
- August live totals reconcile for at least two refresh cycles;
- token handling is approved;
- the owner confirms the workbook permissions.
