# Invoicing and sending invoices: a working guide

A plain guide to the monthly process in Opera, from raising charges to getting invoices out to tenants. Everything happens per asset (Rosehill, Peartree, Southgate) and per charge type (rent and electric are handled separately).

---

## The monthly rhythm

For each asset the process runs in this order:

1. Raise the rent charges for the month (Rent: Invoicing).
2. Raise the electric charges from meter readings (Electric: Invoicing), if applicable.
3. Send the issued invoices to tenants (Email Invoices), or record how they were otherwise sent.

Rent is billed in advance, so the rent run for a month is normally done at the start of that month or the end of the month before.

---

## Rent: Invoicing, step by step

Open the asset, then the **Rent: Invoicing** tab. The top card shows the workflow: **Preview, Generate, Approve, Issue.**

**1. Choose the billing month.** It defaults to next month because rent is billed in advance. Change it if you are catching up on a past month.

**2. Preview charges.** This is a dry run. It lists every charge that would be created for the month, with the unit, tenant, and the net, VAT and gross amounts. The Note column flags anything unusual: a final month pro rata, a rent free period, an incentive, or that a charge already exists. Nothing is saved at this stage. Use it to check the figures before you commit.

**3. Generate drafts.** This creates the charges as **DRAFT**. It is safe to run: it skips any lease that already has a rent charge for that month, so you cannot create duplicates. The amount is worked out here (annual rent divided by twelve, adjusted for any incentive, and pro rata for a tenant with a scheduled leaving date).

**4. Review.** The month's charges now show in a table with status badges. If you changed a lease's rent after generating, use **Regenerate drafts** to refresh the draft amounts from the current lease terms. This only affects drafts. You can open any invoice as a PDF from the row.

**5. Approve drafts.** This moves the drafts from **DRAFT** to **APPROVED**. It is a deliberate checkpoint. You have signed off the figures, but nothing has gone to the tenant or to the billing ledger yet.

**6. Issue approved.** This moves them from **APPROVED** to **ISSUED**, dated today, after a confirmation. This is the point at which each invoice becomes real:

- it is posted to Billing as an amount due,
- it counts towards outstanding balances and arrears,
- it can now be emailed and downloaded as a PDF,
- it is fixed. Any later change is made through Adjust or Cancel, never by editing.

---

## Electric: Invoicing

Electric follows the same lifecycle (Approve, then Issue), with one difference at the start. Electric drafts are not generated from a monthly button. They are created automatically when you enter a meter reading on the **Meter Readings** screen, for meters where billing is switched on. Reference only meters (usage tracked but not billed) raise no charge.

So the electric run is: enter the readings, then on **Electric: Invoicing** review the cycle, Approve, and Issue. A tenant with more than one metered suite is billed per suite, and those combine into a single email later.

---

## Sending invoices by email

Once invoices are issued, open the **Email Invoices** tab.

- Choose Rent or Electric, and the month.
- Each tenant appears as a card showing the exact email they will receive: subject, body and the PDF attachment or attachments. A tenant with several suites gets one email with a block per suite and a combined total.
- Send one tenant at a time with **Send**, or the whole batch with **Send all unsent**.

Recipients come from the **Invoice recipients** field on the tenancy, where you can list more than one address separated by commas. If that is blank, the tenant's accounts email is used.

**Test mode and live mode.** An asset only sends real emails to tenants when it has been switched live. Until then it is in test mode, where every email is routed to the test inbox with the intended tenant named inside, and nothing is recorded as sent. The banner at the top of the page tells you which mode the asset is in.

**No accidental double sending.** Once a tenant has been sent their invoice, their card shows a green Sent badge with the date. Send all skips anyone already sent, so re-running the batch is safe. If you genuinely need to send again, use **Resend** on that tenant's card, which asks you to confirm first.

---

## Recording other dispatch (WhatsApp, post, by hand)

Some tenants are not sent by email. On the Rent: Invoicing and Electric: Invoicing pages there is a strip to record dispatch for issued invoices, by each tenant's preferred method or by a method you choose. This only records how and when an invoice was sent. It does not send anything. It acts only on invoices that are issued and not yet marked sent, so it will not re-mark.

---

## Corrections after an invoice is issued

An issued invoice is a fixed record, so corrections are made deliberately, never by editing the figure:

- **Adjust:** change the amount of an issued invoice (for example a grace reduction agreed after issue). The change and your reason are recorded.
- **Cancel or write off:** if the invoice is not due (for example raised in error, or after a tenant has left), cancel it. If it is due but you are giving up on collecting it, write it off. Either way the invoice is kept for audit with the reason, and it stops counting as outstanding.

Both are found by opening the charge from the billing or invoicing screens.

---

## Ending a tenancy

On the tenancy page, **End Tenancy** is date aware:

- A **future date** records notice. The tenancy stays active and keeps billing until then, the final month is charged pro rata, and it ends automatically on the date.
- **Today or a past date** ends it immediately, vacating the unit and stopping electric billing.

The lease is always kept as a historic record and can be found under Past Tenancies on the asset's Leases tab.

---

## Things to remember

- Preview writes nothing, and Generate cannot create duplicates, so the front of the process is safe to explore.
- Issue is the commit point. After it, use Adjust or Cancel rather than editing.
- Everything is per asset and per charge type. Rent and electric are run separately.
- Emailing only goes to real tenants when the asset is switched live. Check the banner.
- Send all skips anyone already sent. Resend is there for the deliberate cases.
