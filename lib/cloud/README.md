# Yandex Cloud Function for precise daily trigger at 19:00 MSK

Replaces unreliable GitHub Actions cron with exact time trigger via Yandex Cloud Timer.

## 1. Create GitHub Personal Access Token

**Classic token is required** — fine-grained tokens don't support `workflow_dispatch`.

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Name: `VoyahChat YandexCloud Password Trigger`
4. Expiration: No expiration
5. Scopes: check `repo` and `workflow`
6. Generate token

## 2. Create Yandex Cloud Function

1. https://console.yandex.cloud/functions → Create function
2. Name: `voyahchat-password-trigger`
3. Runtime: **Node.js 18** (or higher)
4. Method: **handler**
5. Code: copy contents of `index.js`
6. Environment variables:
   - `GITHUB_TOKEN` = your token from step 1
7. Create version

## 3. Configure Timer Trigger

1. In function → Triggers → Create trigger
2. Type: **Timer**
3. Cron expression: `0 16 ? * *` (16:00 UTC = 19:00 MSK, daily)
4. Invoke: `voyahchat-password-trigger`
5. Create

## 4. Disable old GitHub cron (optional)

In `external/voyahchat-content/.github/workflows/update-password.yml`:

```yaml
on:
  # schedule:
  #   - cron: '36 15 * * *'
  workflow_dispatch: {}
```
