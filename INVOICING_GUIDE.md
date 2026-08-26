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

## Adding a charge after the run (mid-cycle lettings)

If a tenancy starts after you have already generated the month — a new letting, a unit
split, a lease created late — you do not need to redo the run. Go back to Rent:
Invoicing, choose the same month, and use **Check for missing charges**. The preview
lists every tenancy, marking those that already have a charge, and offers to generate
only the ones that do not. Generation always skips a lease that already has a charge
for that month, so re-running can never duplicate. Approve and Issue the new draft in
the usual way, then send it from Email Invoices; tenants already sent are skipped.

## Electric: Invoicing

Electric follows the same lifecycle (Approve, then Issue), with one difference at the start. Electric drafts are not generated from a monthly button. They are created automatically when you enter a meter reading on the **Meter Readings** screen, for meters where billing is switched on. Reference only meters (usage tracked but not billed) raise no charge.

So the electric run is: enter the readings, then on **Electric: Invoicing** review the cycle, Approve, and Issue. A tenant with more than one metered suite is billed per suite, and those combine into a single email later.

**Bulk upload.** Rather than typing each meter, use **Bulk upload readings**: download the template, fill in the Reading column (leave a meter blank to skip it), set the date the meters were read, and upload. The date is deliberately left empty and the upload stays locked until you fill it in, because it is almost never the day you are sitting there entering them. You are asked to confirm the date in words before anything is written.

**A reading that goes down is refused.** If you enter a reading lower than the one before it, the system stops and tells you both readings and both dates. A meter cannot run backwards, so the usual cause is a missed decimal — reading 1026 off a meter that actually shows 1026.54. Check the meter and enter the full figure. The one exception is a genuine rollover, where the meter has passed its maximum and restarted near zero; that is recognised automatically and still goes through. If a meter has actually been reset or replaced, register it under Manage Meters rather than entering a lower reading.

**Getting a reading wrong.** On the Meter Readings screen each reading has **Edit** and **Clear**. Both work only on the most recent reading for that meter, and only while its charge is still a draft. Clear removes the reading and its draft charge together, so a whole cycle entered against the wrong date can be cleared line by line and re-uploaded. Once the charge has been approved or issued, Clear refuses and the correction has to go through Adjust or Cancel instead.

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

## Paying in advance, and overpayments

When you record a payment it clears whatever is outstanding at that moment, oldest first. Anything left over sits on the receipt as **unallocated** — it is money you have received and are holding, not money attached to anything.

It is **not** applied on its own. A tenant who pays September's rent in August will still show September as fully outstanding, and will still read as in arrears, until you apply the credit. This is deliberate: cash is only moved when you say so.

To apply it, go to **Rent: Payments** (or **Electric: Payments**). Any tenant holding credit shows **"£1,000.00 credit held"** against their row with an **Apply** button. Pressing it sets the credit against their oldest unpaid invoice first, up to whatever they owe, and asks you to confirm the amount first. The invoice is dated the day the money was actually received, not the day you press the button.

Credit is held against the **tenant**, so a tenant with several units sees the same credit on each of their rows; applying it on one uses it up. Any part you do not use stays as credit for next time. If they owe nothing at all, the row says so and there is no button.

If you later Reverse the original receipt, the applied credit unwinds with it, because applying credit is a real allocation of that payment rather than a separate adjustment.

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
