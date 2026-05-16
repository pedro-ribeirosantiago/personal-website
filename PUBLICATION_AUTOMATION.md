# Publication Automation

This website can check Google Scholar once per month and open a pull request when new current-year publications are found.

## How It Works

- `.github/workflows/check-publications.yml` runs on the first day of each month.
- `scripts/check-publications.mjs` checks the Google Scholar author profile through SerpAPI.
- If new publications are found, the script adds draft citation entries to `publications.html`.
- If Google Scholar citation data changes, the script refreshes `assets/citation-trend.svg`.
- GitHub opens a pull request for review.
- You accept the update by reviewing and merging the pull request.

## Setup

1. Create a SerpAPI account and API key.
2. In the GitHub repository, go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Add a repository secret named `SERPAPI_KEY`.
4. Make sure GitHub email notifications are enabled for pull requests in the repository.

## Manual Run

In GitHub, open the `Actions` tab, choose `Check Google Scholar publications`, and click `Run workflow`.

## Notes

Google Scholar does not provide an official public API, so this workflow uses SerpAPI as a safer structured source. The pull request should still be reviewed before merging because citation metadata and the generated citation chart may need small manual corrections.
