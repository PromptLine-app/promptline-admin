export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .json({ error: "Zoho OAuth credentials are not configured on the server" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { code, redirect_uri } = body;

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // Try exchanging the code for a refresh token.
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
    });
    if (redirect_uri) {
      params.append("redirect_uri", redirect_uri);
    }

    const tokenResponse = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      // If it fails with invalid_code, the user might have pasted an already exchanged refresh token or an expired code.
      // We'll return the error to the frontend.
      return res.status(400).json({ error: tokenData.error || "Failed to exchange code" });
    }

    // A refresh token is only issued on the very first code exchange for a specific user/client pair.
    // If it's missing, they might have generated a code again without revoking the previous one.
    if (!tokenData.refresh_token) {
      return res.status(400).json({ error: "No refresh token returned. You may need to revoke the previous connection in Zoho and generate a new code." });
    }

    return res.json({ refresh_token: tokenData.refresh_token });
  } catch (err) {
    console.error("Zoho marketing token exchange error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
