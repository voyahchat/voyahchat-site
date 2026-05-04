// Yandex Cloud Function to trigger GitHub Actions at exact time (19:00 MSK)

module.exports.handler = async function (_event, _context) {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO = 'voyahchat/voyahchat-content';

    const response = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/update-password.yml/dispatches`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'User-Agent': 'YandexCloudFunction-PasswordTrigger',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: 'main' }),
        },
    );

    if (response.ok) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Workflow triggered successfully',
                timestamp: new Date().toISOString(),
            }),
        };
    }

    throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
};
