  /* ── Onboarding intake docx parsen via Claude — alleen super-admin ── */
  async "onboarding-import"(env, body, caller) {
    if (!caller || !caller.isSuper)
      return json({ error: "Alleen voor super-admin" }, 403);

    const text = String(body.text || "").trim();
    if (!text || text.length < 50)
      return json({ error: "Geen of te weinig tekst ontvangen" }, 400);

    if (!env.ANTHROPIC_API_KEY)
      return json({ error: "ANTHROPIC_API_KEY niet geconfigureerd" }, 500);

    const systemPrompt = `Je bent een data-extractie assistent. Je krijgt de platte tekst uit een ingevuld VisiOffer Onboarding Intake formulier (.docx). Extraheer alle ingevulde velden en retourneer ALLEEN een JSON object, zonder markdown backticks, zonder uitleg.

Het JSON object moet deze structuur hebben (laat lege velden als lege string ""):

{
  "companyName": "officiële bedrijfsnaam",
  "companyNameShort": "handelsnaam of korte naam (indien anders, anders zelfde als companyName)",
  "vatNumber": "BTW-nummer",
  "address": "volledig adres op 1 lijn",
  "website": "website URL",
  "contactPerson": "naam contactpersoon onboarding",
  "contactEmail": "e-mail contactpersoon",
  "contactPhone": "telefoon contactpersoon",
  "sectors": ["lijst", "van", "aangevinkte", "sectoren"],
  "quotesPerMonth": "aantal offertes per maand",
  "avgQuoteValue": "gemiddelde offertewaarde",
  "currentTool": "huidige tool/software",
  "primaryColor": "hex kleurcode primaire kleur of kleurnaam",
  "secondaryColor": "hex kleurcode secundaire kleur",
  "backgroundColor": "achtergrondkleur",
  "textColor": "tekstkleur",
  "quoteValidity": "geldigheidsduur offerte",
  "paymentTerms": "betalingstermijn",
  "vatPercentage": "BTW percentage",
  "pdfFooter": "voettekst op offertes",
  "currency": "valuta",
  "quoteLabel": "hoe noemen ze een offerte",
  "roomLabel": "hoe noemen ze een ruimte (enkelvoud)",
  "productLabel": "hoe noemen ze een product (enkelvoud)",
  "offersInstallation": "ja/nee",
  "installRate": "uurtarief installatie",
  "installMinHours": "minimum uren",
  "tierPlugPlay": "uren voor plug & play tier",
  "tierStandard": "uren voor standaard tier",
  "tierComplex": "uren voor complex tier",
  "tierHeavy": "uren voor zwaar tier",
  "setupInvoicing": "ja/nee/later",
  "invoiceFormat": "factuurnummering formaat",
  "iban": "IBAN nummer",
  "useOGM": "ja/nee",
  "invoicePaymentTerms": "betalingstermijn facturen",
  "users": [
    {"name": "volledige naam", "email": "e-mailadres", "role": "Admin/Verkoper/Viewer", "phone": "telefoonnummer"}
  ],
  "extraNotes": "eventuele extra opmerkingen"
}

Regels:
- Gebruik ALLEEN waarden die expliciet in de tekst staan. Verzin niets.
- Als een checkbox-veld is aangevinkt (☑ of ✓ of [x]), neem het op. Als niet aangevinkt (☐ of □), sla het over.
- Kleurcodes: als iemand "donkerblauw" schrijft, laat het als "donkerblauw". Converteer alleen naar hex als er al een hex staat.
- Users: neem alleen rijen op waar minstens een naam OF e-mail is ingevuld.
- Retourneer ALLEEN het JSON object, niets anders.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          { role: "user", content: "Hier is de tekst uit het onboarding intakeformulier:\n\n" + text }
        ],
        system: systemPrompt
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return json({ error: "Claude API fout: " + (data.error?.message || res.status) }, 502);

    // Extract text from response
    const responseText = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    // Parse JSON from response
    try {
      const clean = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      return json({ ok: true, parsed });
    } catch (e) {
      return json({ error: "Claude response kon niet als JSON geparsed worden", raw: responseText }, 500);
    }
  },
