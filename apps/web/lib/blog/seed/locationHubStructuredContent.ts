import type { BlogContentJson } from "@/lib/blog/content-json";

export type LocationHubSeed = { slug: string; content_json: BlogContentJson };

function hub(slug: string, blocks: BlogContentJson["blocks"]): LocationHubSeed {
  return { slug, content_json: { schema_version: 1, blocks } };
}

/**
 * Seven location hubs — competitive SEO copy with inline `[label](/path)` links in paragraphs.
 * Re-export JSON via: `npx tsx apps/web/scripts/export-location-hub-structured-json.ts`
 */
export const LOCATION_HUB_STRUCTURED_PAGES: LocationHubSeed[] = [
  hub("cleaning-services-claremont-cape-town", [
    {
      type: "paragraph",
      content: `Book trusted cleaning services in Claremont with upfront pricing and same-week availability—see your price online before you commit, then lock a slot without WhatsApp ping-pong. Whether you’re off Main Road near school-run traffic, in a Cavendish-close sectional title, or tucked into Harfield Village, [instant quote](/booking) takes minutes. Same-day spots open when calendars allow; most confirmed Claremont visits land inside 24–72 hours.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Claremont: bedrooms, bathrooms & what shifts the quote`,
    },
    {
      type: "paragraph",
      content: `Real cleaning prices in Claremont track layout more than postcode. A one-bedroom, one-bathroom walk-up near Cavendish commonly lands roughly R350–R520 for a typical standard visit before add-ons. A two-bedroom, two-bathroom flat off Vineyard or Kildare usually prints around R550–R780 once both baths are sanitised properly—not just wiped. A three-bedroom family house with two or three bathrooms regularly sits R680–R950+ on standard-to-deep scopes because kitchens, passages, and multiple wet rooms chew predictable minutes.`,
    },
    {
      type: "paragraph",
      content: `Within those bands, quotes climb when you tick move-out inventory rigour, neglected ovens or grout that belongs in deep tier instead of maintenance standard, or extras such as interior fridge fronts and [carpet cleaning](/services/carpet-cleaning-cape-town). Student flats with shared baths can trend lighter when clutter is minimal; renovated executive kitchens still need the same bath maths—don’t under-count showers. Still weighing tiers? Compare [standard cleaning](/services/standard-cleaning-cape-town) with [deep cleaning](/services/deep-cleaning-cape-town), then lock numbers in [booking](/booking).`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Claremont`,
    },
    {
      type: "bullet_list",
      items: [
        `Property size & wet zones—every bedroom and bathroom you confirm adjusts mop, vacuum, and sanitising loops; counting a study as a spare bedroom keeps labour honest.`,
        `Condition & occupancy—pet hair, skipped weeks of wiping, grease films behind stoves, or muddy passages after winter rain extend scrub time versus a lightly used apartment.`,
        `Extras you select—oven interior, fridge interior, detailed grout or shelf packs stack consecutive tasks; skip anything you’ll redo yourself tomorrow.`,
        `Access logistics—boom gates, basement bays, Main Road school-hour arrivals, or narrow shared drives determine whether hour one is cleaning or circling; brief once in booking notes.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Standard cleaning — Surface-focused upkeep: kitchens wiped down, bathrooms sanitised, floors vacuumed/mopped, dusting in living zones. Book when you need dependable rhythm between bigger resets—think fortnightly family upkeep or post-travel tidy.`,
        `Deep cleaning — Built-up grime targets: degreased cooktops, descaled taps, detailed skirtings, appliance fronts, and neglected corners standard passes skip. Choose it before hosting inspections, after renovations, or when bathrooms haven’t seen elbow grease in months.`,
        `Move-out cleaning — Inventory-aware finishes aimed at ovens, grout lines, cupboards, and wet rooms agents photograph. Tenants align it with handover dates; sellers pair it with show-house timelines.`,
        `Airbnb cleaning — Guest-ready bathrooms/kitchens, linen-ready surfaces, rubbish cleared, quick resets between checkout and check-in. Hosts near campus corridors add keypad/parking notes so crews don’t burn daylight hunting access.`,
        `Carpet cleaning — Focused extraction or shampoo passes on rugs and bedrooms where dogs, kids, or winter boots shorten fibre life—often bolted onto deeper visits rather than guessed separately.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Claremont homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when Rondebosch-adjacent agents send inventory PDFs and grout suddenly matters more than pride. Airbnb hosts book between tight guest gaps—especially when basement remotes and Cavendish-week traffic threaten late check-ins. Families book after sport-season Saturdays when mudrooms, ovens, and three bathrooms surrender at once. Landlords book ahead of show days or between leases when cottages must smell neutral under winter viewing lights. Hybrid workers book mid-quarter when kitchens never cool between Zoom blocks. Peak demand hits month-end and school holidays—mid-week drops often carry calmer calendars.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Dual-income households who book after cleaners ghost them Friday night—crews arrive briefed on boom codes and basement bays, not blind pins.`,
        `Airbnb hosts cycling guests near campus pockets—turnovers timed between checkout photos and the next keypad message.`,
        `Tenants racing Rondebosch-adjacent inventories—checklists align with what agents photograph first.`,
        `Landlords refreshing cottages before open homes—kitchens and wet rooms that pass sniff tests under winter light.`,
        `Transparent pricing: what you select online is what teams execute—no “extras at the door” surprises.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Claremont`,
    },
    {
      type: "paragraph",
      content: `Dispatched routes cover Harfield Village, Newlands, Rondebosch, Kenilworth, Wynberg, Plumstead, and Bishopscourt daily—less windshield time means tighter arrival windows than city-wide call centres. Mention gatehouses or visitor discs once; teams carry Southern Suburbs familiarity from visit to visit.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Claremont?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near you in Claremont should mean Southern Suburbs locals—not vans touring in from the far north. Shalean matches “near me” searches with pros already running Harfield, Newlands, and Rondebosch-adjacent streets, so availability rebounds faster after busy weekends and school breaks. Confirm online in one flow; pricing and arrival expectations are spelled out before anyone parks.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Claremont clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Booking takes just a few minutes online—start with the [instant booking tool](/booking), then follow the steps below to confirm your cleaning service.`,
    },
    {
      type: "numbered_list",
      items: [
        `Enter your address and confirm Claremont or nearby suburb coverage.`,
        `Select bedrooms, bathrooms, and any extras like oven or fridge cleaning.`,
        `Choose your service type—standard, deep, move-out, or Airbnb cleaning.`,
        `Pick your preferred date and arrival time.`,
        `Review your total price and confirm securely online.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Claremont?`,
          answer: `After you complete the online flow, many households secure visits inside 24–72 hours because Southern Suburbs crews already route Harfield, Newlands, and Rondebosch-adjacent streets. Same-day pockets appear when cleaners finish early or cancellations open gaps—worth checking, but never promise guests or agents until you’ve confirmed in-app. Month-end, school holidays, and post-rain mud weeks tighten calendars fastest; booking Sunday night for the coming week usually beats waiting until Tuesday morning.`,
        },
        {
          question: `How much does a 2-bedroom cleaning cost in Claremont?`,
          answer: `Most two-bedroom homes land roughly R550–R780 once two bathrooms are sanitised properly—studios posing as “two-bed” shares with one bath trend lower, while dual bathrooms + balcony grit after windy weeks trend higher. Add-ons such as interior ovens, fridge fronts, or carpet extraction move the total independently of bedroom count. Generate an itemised preview in the online booking flow; totals update instantly when you tick extras or switch from standard to deep scope.`,
        },
        {
          question: `Do cleaners bring their own supplies?`,
          answer: `Yes—professional-grade consumables and equipment travel with vetted teams unless your sectional title or allergy brief requests owner-supplied products. If you need fragrance-free, eco-only, or vacuum-noise restrictions, flag it during booking so coordinators stock accordingly before dispatch rather than improvising on your doorstep.`,
        },
        {
          question: `Can I book same-day cleaning in Claremont?`,
          answer: `Sometimes—especially mid-week when suburban routes still carry whitespace—but don’t anchor guest check-ins or inventory handovers on “maybe.” Next-day or clearly scheduled slots survive lift delays, boom-gate confusion, and parking hunts far better. If same-day is critical, complete the quote immediately and watch live availability rather than messaging ad hoc.`,
        },
        {
          question: `Do you handle move-out or end-of-lease cleaning?`,
          answer: `Yes. Move-out scope emphasises evidence zones inspectors zoom in on: ovens, fridges (when selected), grout, skirtings, cupboards, and bathrooms that photograph harshly under LED flashes. It’s built for tenants aligning keys with agencies and landlords prepping deposits—not for light tidy-ups mistaken for inventory-grade finishes. Pair booking notes with your agent checklist highlights so crews prioritise what loses deposits fastest.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Start in the online booking flow, confirm Claremont coverage, enter accurate bedrooms and bathrooms, choose standard/deep/move-out/Airbnb as appropriate, select extras honestly, then pick a slot and pay securely once the itemised total matches your expectations. That sequence preserves audit trails, locks pricing to scope, and feeds dispatch the boom codes or basement directions they need before arrival.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Ready when you are: the flow takes minutes, you’ll see your exact price before paying, and there’s no haggling or surprise line items after checkout—just clear scope, clear availability, and a team briefed on what you bought.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Claremont`,
      description: `Get instant pricing and confirm your booking online in minutes.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-sea-point-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in Sea Point mean salty film on glass, tight Airbnb gaps, and lifts that eat daylight if you brief them wrong. Shalean pairs upfront pricing with live availability—pull an [instant quote](/booking), lock a slot online, and skip WhatsApp roulette. Same-day opens when calendars allow; most Seaboard bookings confirm within a few days once bedrooms and bathrooms are honest.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Sea Point: bedrooms, bathrooms & coastal wear`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Sea Point hinge on beds, baths, and how much coastal grit joined the party. A one-bedroom, one-bathroom apartment inland of Main Road frequently lands near R420–R620 for maintenance cleans when balconies stay manageable. Two-bedroom, two-bathroom Atlantic-facing stock commonly prints R620–R880 once both baths and open-plan living zones get proper passes. Three-bedroom units—especially with extra bathrooms or dual balconies—often ride R820–R980+ before oven or carpet add-ons because sand tracks through passages faster than suburban carpets.`,
    },
    {
      type: "paragraph",
      content: `Quotes widen when humid weeks bake grease onto cooktops, windy stretches plaster balconies in salt, or move-out scopes demand inventory-grade ovens. Basement carries and lift waits don’t magically shrink scrub time—accurate bathroom counts matter more than ocean views. Compare [standard cleaning](/services/standard-cleaning-cape-town) with [deep cleaning](/services/deep-cleaning-cape-town), then confirm line items in [booking](/booking).`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Sea Point`,
    },
    {
      type: "bullet_list",
      items: [
        `Unit footprint—extra bathrooms and split-level layouts multiply sanitising loops even when square metres look modest on paper.`,
        `Coastal condition—sand in sliding tracks, salty film on glass, and pollen-rich sills add wipe cycles versus lightly used lock-ups.`,
        `Extras—interior ovens, fridge packs, or [carpet cleaning](/services/carpet-cleaning-cape-town) queue additional timed tasks after floors are addressed.`,
        `Building logistics—loading-zone waits, concierge sign-ins, remote lifts, and long carpark carries shrink effective cleaning minutes unless notes warn coordinators upfront.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Standard cleaning — Weekly-friendly upkeep: surfaces wiped, bathrooms sanitised, floors vacuumed/mopped, quick dusting of open-plan zones. Ideal when promenade walks deposit predictable grit but ovens aren’t forensic-level dirty.`,
        `Deep cleaning — Degrease kitchens, descale taps, detail tile grout, hit skirtings, and restore bathrooms after humid weeks or neglected upkeep. Choose before hosting shoots, allergy spikes, or when standard passes stop moving the needle.`,
        `Move-out cleaning — Inventory-focused detailing across cupboards, ovens (when selected), wet rooms, and floors agents photograph in bright Seaboard light—built for tenants handing keys and landlords comparing departure PDFs.`,
        `Airbnb cleaning — Checkout rubbish cleared, bathrooms polished, kitchens guest-ready, linen-adjacent surfaces tidied—timed between guest messages and loading-bay logistics.`,
        `Carpet cleaning — Targeted extraction where barefoot traffic, humidity, and sandy shoes mat fibres—often scheduled after guest-heavy weeks rather than guessed ad hoc.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Sea Point homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when inventory zoom-ins expose grout agents won’t ignore. Airbnb hosts book between concert weekends and December peaks when lifts queue longer than scrubbing time. Families book once promenade sand migrates into rugs faster than mid-week vacuuming. Landlords book when last guest’s sunscreen scent lingers into the next lease. Remote workers book after humid spells trap dust that triggers allergies behind closed balcony doors.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Concierge-savvy crews who already decode visitor discs, loading bays, and remotes—no tourists circling your block guessing pins.`,
        `Calendar honesty during Seaboard peaks—book early after windy stretches when grit spikes indoor passes.`,
        `Quote fidelity: bedroom and bathroom ticks update totals before checkout—ideal when co-hosts audit screenshots.`,
        `Turnover-ready briefs that mention noisy-hour bylaws so strata complaints don’t ambush your reviews.`,
        `Clear scope online—what you purchase is what arrives at the door, not vague “make it shiny” chats.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Sea Point`,
    },
    {
      type: "paragraph",
      content: `Runs naturally thread Green Point, Fresnaye, and Bantry Bay—similar apartment DNA where concise buzzer codes beat lengthy lobby debates. Need fibre-safe freshness after sandy shoes? Pair periodic visits with guidance from our [carpet cleaning](/services/carpet-cleaning-cape-town) page before choosing add-ons.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Sea Point?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near you in Sea Point should understand Atlantic Seaboard logistics—not generic “cleaning services in Cape Town” vans hunting basement ramps for twenty minutes. Shalean routes pros already running Green Point and Bantry Bay-adjacent towers, so “near me” actually means shorter waits after windy weekends. Start from [booking](/booking), note scratch-card or bay rules once, and pricing stays transparent before you pay.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Sea Point clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Use the [instant booking tool](/booking), then walk through the steps below—your building brief travels with the job.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Sea Point or adjacent Seaboard coverage and paste intercom or concierge instructions.`,
        `Enter bedrooms, bathrooms, and extras—count ocean-facing balconies honestly if sand tracks indoors.`,
        `Pick standard, deep, move-out, or Airbnb cleaning depending on guest or inventory pressure.`,
        `Choose a slot that respects body corporate noise windows.`,
        `Review your itemised cleaning prices in Sea Point online, then pay securely once scope matches reality.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Sea Point?`,
          answer: `Many visits slot within a few days once you confirm online—Seaboard crews already loop Main Road stacks daily. Same-day sometimes appears mid-week when cancellations open gaps; never promise guests until the app confirms. After windy holidays or concerts, grab Tuesday–Thursday midday windows before sunset lift queues swallow crews.`,
        },
        {
          question: `How much does a 2-bedroom cleaning cost in Sea Point?`,
          answer: `Expect roughly R620–R880 for many two-bed, two-bath apartments once both wet rooms are sanitised end-to-end—single-bath stock trends lower, dual-balcony grit trends higher. Add ovens, fridge interiors, or carpet extraction only when needed; totals refresh live as you tick boxes inside the booking flow.`,
        },
        {
          question: `Does Sea Point pricing assume elevator delays?`,
          answer: `Base quotes expect ordinary lift access—not endless holiday-move queues. If your block routinely stacks trolleys in loading bays, describe it in notes so labour matches reality; otherwise crews compress bathroom minutes to hit unrealistic clocks.`,
        },
        {
          question: `Can I preview Airbnb turnover totals before paying?`,
          answer: `Yes—configure beds, baths, tier, and extras, read the breakdown, then checkout only after you approve. That keeps co-host reimbursements tidy and prevents post-review surprises.`,
        },
        {
          question: `Do cleaners bring supplies for humid coastal kitchens?`,
          answer: `Teams arrive with professional kits suited to grease films humidity exaggerates—flag eco-only or fragrance-free needs during booking so vans stock the right chemistry before arrival.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Start in the online booking flow, confirm Sea Point coverage, enter accurate wet-room counts, choose tier and extras honestly, pick a compliant arrival window, then pay once totals match your brief—concierge details should land in notes, not last-second texts.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `You’ll see itemised cleaning prices in Sea Point before card capture—no guesswork at the door, no surprise surcharges after checkout.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Sea Point`,
      description: `Coastal-apartment pricing with live availability.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-rondebosch-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in Rondebosch sit where duplex stairs, shared drives, and campus-adjacent rentals collide—brief gate remotes once, then book online with upfront pricing and visible availability. Compare [standard cleaning](/services/standard-cleaning-cape-town) with heavier resets via [instant quote](/booking) before exams-week chaos eats your weekend. Most Southern Suburb slots confirm within several days; same-day appears only when calendars briefly open.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Rondebosch: bedrooms, bathrooms & split-level reality`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Rondebosch reward honest bedroom and bathroom maths. A compact one-bedroom flat with one shared bathroom often lands near R380–R560 for recurring standard visits when clutter stays manageable. Two-bedroom student stock with one or two bathrooms typically prints R520–R720 depending on whether baths are truly sanitised end-to-end. Three-bedroom houses—especially with three bathrooms and stair-heavy layouts—commonly ride R720–R940+ before ovens or [carpet cleaning](/services/carpet-cleaning-cape-town) enter the brief.`,
    },
    {
      type: "paragraph",
      content: `Four-bedroom homes with bonus baths push toward the top of the band because each wet room adds mop-and-rinse cycles landlords photograph harshly. Term-time kitchens that absorb instant noodles and weekend braais may need deep-tier chemistry before standard cadence sticks. Compare tiers via [standard cleaning](/services/standard-cleaning-cape-town) vs [deep cleaning](/services/deep-cleaning-cape-town); align heavy exits with [move-out cleaning](/services/move-out-cleaning-cape-town) before promising agents a handover hour.`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Rondebosch`,
    },
    {
      type: "bullet_list",
      items: [
        `Split-level layouts & stairs—carrying gear across stacked floors eats clock faster than equivalent square metres on one level.`,
        `Housemates vs family occupancy—student rotations with neglected bathrooms demand longer sanitising passes than lightly used spare rooms.`,
        `Seasonal grit—leafy streets plus winter mud track into passages when boots pile beside doors.`,
        `Shared-drive logistics—tandem bays, campus-week traffic, and narrow Observatory-adjacent entrances burn setup time unless notes arrive early.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Deep cleaning — Pulls grease from stove surrounds, descales taps, refreshes grout lines, and hits skirtings after semesters or before parental inspections—ideal when “tidy” still fails sniff tests.`,
        `Standard cleaning — Predictable kitchens, bathrooms, floors, and dusting so duplex corridors survive busy weeks without clutter avalanches.`,
        `Move-out cleaning — Oven fronts, cupboard wipes, bathroom polish, and floor edges tuned to what Observatory-adjacent inventories emphasise—book when deposits outweigh DIY weekends.`,
        `Airbnb cleaning — Rapid turnovers with concise notes on remotes, visitor bays, and noisy-hour etiquette near campus corridors.`,
        `Carpet cleaning — Hall runners and bedrooms where dust from leafy pavements meets indoor shoes-off piles.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Rondebosch homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when Observatory-adjacent inventories demand ovens brighter than Sunday sponges achieve. Airbnb hosts book around graduation noise when checkout gaps shrink to hours. Families book once hybrid-school weeks erase weekday wiping bandwidth. Landlords book between mismatched leases when blinds and grout become deposit flashpoints. Housemates book before parental visits expose skipped bathrooms nobody voted to clean.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Stair-aware crews who haul kits across split levels without pretending your house is a single-storey flat.`,
        `Deposit-minded scopes—tiers and add-ons match what you clicked before debit orders fire.`,
        `Flexible timing around exams, handovers, and concert weekends when parking wars threaten late arrivals.`,
        `House-share friendly quotes you can screenshot before convincing roommates to chip in on oven add-ons.`,
        `Transparent routing across leafy streets—mention gate remotes once; dispatch carries them forward visit to visit.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Rondebosch`,
    },
    {
      type: "paragraph",
      content: `Work naturally spills across Claremont, Observatory, and Newlands—similar slopes and staircases where crews carry supplies efficiently once briefings mention levels upfront. Hosting travellers? Align messaging with our [Airbnb cleaning](/services/airbnb-cleaning-cape-town) checklist before you publish seasonal rates.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Rondebosch?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near you in Rondebosch should navigate shared drives—not burn daylight hunting remotes. Shalean maps cleaning services in Rondebosch to crews already rotating Newlands, Observatory, and Rosebank-adjacent streets, so near-me searches translate into realistic ETAs. Open [booking](/booking), flag stairs or tandem bays, and totals appear before you commit.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Rondebosch clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Start with the [instant booking tool](/booking), then follow each step—your stair count and gate notes ride with the job.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Rondebosch or neighbouring Southern Suburbs coverage.`,
        `Enter bedrooms, bathrooms, studies used as spare rooms, and honest extras.`,
        `Choose standard, deep, move-out, or Airbnb cleaning aligned with deposit or guest pressure.`,
        `Pick a slot around exams or handovers; mention concert weekends if parking tightens.`,
        `Review cleaning prices in Rondebosch online, then checkout securely once scope matches the house.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Rondebosch?`,
          answer: `Most households secure visits within several days after confirming online—crews already route campus-adjacent corridors weekly. Same-day is occasional mid-week; exam and concert peaks swallow Saturdays fastest. Book Sunday night for the week ahead instead of Tuesday panic texts.`,
        },
        {
          question: `How much does a 2-bedroom cleaning cost in Rondebosch?`,
          answer: `Many two-bedroom setups land roughly R520–R720 once bathrooms are sanitised properly—shared-house baths trend differently than ensuite doubles. Update the booking flow as housemates confess extra showers; totals animate instantly so deposits aren’t surprises.`,
        },
        {
          question: `How do you price split-level houses versus flats?`,
          answer: `Beds and baths anchor cost, but stacked floors add haul time and repeated vacuum passes—note stairs and awkward drives so quotes mirror reality. Lift flats compete mostly on wet-room minutes; houses pay stair tax even when floorplans look modest.`,
        },
        {
          question: `Can I lock pricing before telling housemates?`,
          answer: `Generate previews anytime in the online booking flow; pay only once everyone agrees on oven add-ons or deep-tier chemistry.`,
        },
        {
          question: `Do you handle move-out or end-of-lease cleaning?`,
          answer: `Yes—choose move-out tier when inventories demand photo-ready grout and ovens. Paste agent bullet priorities into notes so crews sequence tasks against minutes you actually purchased.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Enter accurate bathrooms and stairs in the booking flow, pick tier and extras, choose a realistic slot, then pay once itemised totals align—digital receipts beat cash envelopes when landlords audit deposit readiness.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Rondebosch stay itemised through checkout—clear scope, clear totals, crews briefed on split levels before they park.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Rondebosch`,
      description: `Transparent quotes for beds, baths & stairs.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-gardens-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in the Gardens thread heritage walk-ups, festival-week footfall, and Bowl kitchens tighter than Southern Suburb spreads—book online with upfront pricing and calendars that respect buzzers, scratch-card parking, and stair-only access. Compare [deep cleaning](/services/deep-cleaning-cape-town) with lighter upkeep, then lock numbers through [instant quote](/booking). Mid-week slots usually open faster than post-event Mondays when hosts race identical turnovers.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in the Gardens: compact flats, dense wet rooms`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in the Gardens reward precision on bathrooms, not optimism on square metres. Studios and compact one-bedroom walk-ups frequently land near R340–R520 for standard visits when kitchens stay under control. Two-bedroom Bowl flats—often split-level or dual-bathroom—typically print R520–R720 because sanitising two wet rooms in tight footprints takes longer than vacuuming extra lounge space. Three-bedroom heritage apartments pushing two or three baths regularly ride R680–R900+ once festival-week dust, balcony pollen, and stair carries enter the math.`,
    },
    {
      type: "paragraph",
      content: `Within those tiers, quotes climb when you need inventory-grade [move-out cleaning](/services/move-out-cleaning-cape-town), interior ovens, fridge packs, or rugs that need [carpet cleaning](/services/carpet-cleaning-cape-town). Agents charging “per bathroom” at inspections mirror how Shalean quotes—under-counting baths saves fake money until handover day. Compare maintenance [standard cleaning](/services/standard-cleaning-cape-town) against heavier [deep cleaning](/services/deep-cleaning-cape-town) before checkout.`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Gardens`,
    },
    {
      type: "bullet_list",
      items: [
        `Vertical access—heritage staircases and buzzer-only entries determine whether cleaners spend opening minutes hauling kits or actually scrubbing.`,
        `Wet-room density—extra bathrooms in compact flats multiply sanitising loops faster than adding another bedroom might suggest.`,
        `Condition signals—mountain dust on sills, grease films on two-burner stoves, and grout neglected since last tenant all extend chemical dwell time.`,
        `Parking & sectional rules—scratch cards, visitor discs, and quiet-hour vacuum limits shrink workable windows unless noted during booking.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Deep cleaning — Targets grout, skirtings, appliance fronts, and detail zones standard wipes skip—choose after events or before landlords photograph tight kitchens.`,
        `Standard cleaning — Maintains countertops, sinks, bathrooms, floors, and light dusting so Bowl flats survive busy fortnights.`,
        `Move-out cleaning — Cupboards, ovens (when selected), wet rooms, and floors aligned with agency PDFs—ideal when keys and deposits hinge on photo evidence.`,
        `Airbnb cleaning — Guest-ready bathrooms/kitchens, rubbish cleared, surfaces staged quietly for noise-sensitive neighbours.`,
        `Carpet cleaning — Rugs that trap pollen without hose-down courtyards—schedule after high-footfall festival weeks.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Gardens homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when Company’s Garden–adjacent inspections demand ovens shinier than weekday bandwidth allows. Airbnb hosts book post–First Thursday or stadium weekends when Monday guests reject Saturday-night bathrooms. Families juggling school runs book once stair climbs erase evening wipe-downs. Landlords book before new tenants expect sinks staged for Stories on hour zero. Remote workers book mid-quarter when two-burner kitchens never cool between Zoom blocks.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Walk-up crews briefed on buzzers, sectional quiet hours, and timed arrivals—not suburban vans guessing CBD logistics.`,
        `Turnover slots when lifts and loading bays calm down, aligned with guest check-ins along Molteno and Hatfield arteries.`,
        `Quote fidelity: bedroom and bathroom ticks sync crews with what you paid—critical when sectional councils audit contractor noise.`,
        `Host-friendly scopes—Airbnb staging, rubbish sequencing, and wet-zone polish without hallway drama.`,
        `Transparent cleaning prices in the Gardens online before card capture—ideal when flatmates split invoices.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around the Gardens`,
    },
    {
      type: "paragraph",
      content: `Runs stitch Tamboerskloof, Oranjezicht, and Vredehoek—parallel density where bay numbers prevent curb-side confusion. Still weighing lighter cadence? Review [standard cleaning](/services/standard-cleaning-cape-town) cadence tips before you subscribe mentally to a rhythm.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in the Gardens?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near me in the Gardens should survive buzzer ballet—not bail at loading bays. Shalean routes cleaning services in the Gardens through teams already rotating City Bowl logistics, so near-me searches land on realistic ETAs. Open [booking](/booking), note stairs and scratch-card quirks, and cleaning prices in the Gardens appear before you commit.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Gardens clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Use the [instant booking tool](/booking)—your sectional notes and stair count travel with the job.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Gardens or neighbouring Bowl coverage.`,
        `Enter bedrooms, bathrooms, and honest wet-room counts—dual baths move quotes faster than lounge space.`,
        `Pick standard, deep, move-out, or Airbnb cleaning aligned with landlord or guest pressure.`,
        `Choose a slot that respects quiet hours; flag festival-week turnover if calendars crunch.`,
        `Review cleaning prices in the Gardens online, then checkout once scope matches the flat.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in the Gardens?`,
          answer: `Most Bowl households confirm within several days once bedrooms and baths are accurate—mid-week mornings fill before frantic Sunday scrambles. Post-event Mondays disappear fastest; reserve slots before First Thursday crowds if you host weekend guests.`,
        },
        {
          question: `How much does a studio or 1-bedroom clean cost in the Gardens?`,
          answer: `Compact walk-ups often land near R340–R520 for standard visits when kitchens behave—dual bathrooms or split levels climb even if square metres look tiny. Refresh totals live as you edit baths; agents photograph wet rooms line by line.`,
        },
        {
          question: `Why does adding one bathroom shift Bowl pricing so much?`,
          answer: `City Bowl flats stack kitchens, passages, and wet rooms into tight footprints—each bath adds a full sanitising loop (fixtures, glass, floors, bins) even when bedrooms barely change. The booking flow reflects those minutes immediately.`,
        },
        {
          question: `Can I book without knowing exact parking rules yet?`,
          answer: `Yes—start with accurate beds/baths and placeholder parking notes, then edit once the body corporate emails scratch-card rules. Dispatch pulls the latest notes before arrival.`,
        },
        {
          question: `What if sectional rules restrict noisy vacuum hours?`,
          answer: `Specify quiet-hour blocks during booking; coordinators sequence quieter tasks early and louder gear once bylaws allow—heritage stacks where trustees patrol noise need this upfront.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Enter bathrooms and stairs honestly, pick tier and extras, choose a realistic slot, pay once itemised totals align—checkout emails beat cash scribbles when landlords reimburse or sectional councils audit spend.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Cleaning prices in the Gardens stay tied to wet-room density—honest bath counts keep crews scrubbing instead of hunting sectional approvals.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Gardens`,
      description: `Walk-up–aware quotes with instant totals.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-wynberg-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in Wynberg bridge leaf litter, pet traffic, and school-week kitchens that barely cool—book online with bedrooms-accurate pricing and calendars that respect side gates, estate decals, and mudrooms. Families weigh cadence via [standard cleaning](/services/standard-cleaning-cape-town); hosts align [Airbnb cleaning](/services/airbnb-cleaning-cape-town) before syncing calendars—then confirm totals in [instant quote](/booking). Saturday sport windows tighten slots; mid-week visits recover faster after muddy weekends.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Wynberg: beds, baths & garden grit`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Wynberg track beds, baths, and how much garden grit rides indoors. A modest two-bedroom townhouse with two bathrooms often lands near R420–R620 when kitchens stay on weekly autopilot. Three-bedroom homes with two baths—the suburban sweet spot—typically print R560–R780 depending on pets and gravel drives. Four- and five-bedroom stock with bonus bathrooms frequently pushes R780–R910+ before ovens, interior windows, or [carpet cleaning](/services/carpet-cleaning-cape-town) join the job.`,
    },
    {
      type: "paragraph",
      content: `Estates with mudrooms swallow boots faster after storms; braai patios coat extraction filters with smoke films that standard wipes won’t reset. Honest bathroom counts matter more than flattering square-metre guesses—agents photograph wet rooms line by line. Compare [standard cleaning](/services/standard-cleaning-cape-town) cadence against [deep cleaning](/services/deep-cleaning-cape-town) when passages still feel gritty after DIY weekends.`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Wynberg`,
    },
    {
      type: "bullet_list",
      items: [
        `Footprint & bathrooms—multi-wing houses multiply mop cycles even when kerb appeal looks similar to neighbours.`,
        `Outdoor lifestyle load—pets, bougainvillea debris, and rugby-boot mud determine vacuum intensity.`,
        `Extras—oven interiors, fridge packs, carpet extraction, or interior windows queue timed tasks after core rooms.`,
        `Estate logistics—contractor tags, remote gates, and Saturday fixture traffic shrink workable arrival windows unless noted early.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Deep cleaning — Strikes baked-on braai residue, pet hair nests, and bathroom buildup before allergies or inspections escalate—ideal quarterly or pre-event.`,
        `Standard cleaning — Keeps kitchens, bathrooms, floors, and dusting on rails between seasonal resets when school-week chaos never pauses.`,
        `Move-out cleaning — Deposit-aware detailing across cupboards, ovens (when selected), wet rooms, and tiled entries agents zoom in on.`,
        `Airbnb cleaning — Reliable staging for Plumstead-adjacent listings with linens-ready bathrooms and tidy kitchens before weekend travellers arrive.`,
        `Carpet cleaning — Lounges where indoor-outdoor living drives grit deeper—schedule after muddy holidays or shedding season peaks.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Wynberg homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when Southern Suburbs inventories demand ovens brighter than Sunday sponges deliver. Airbnb hosts book around school holidays when turnaround hours shrink. Families book once Wednesday dinners wreck sinks before Thursday meetings while teen bedrooms mutate overnight. Landlords book show days where oak-lined gardens shed leaves onto tiled entries. Empty-nesters book deep resets before December relatives arrive from Gauteng with luggage and opinions.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Suburban crews comfortable with multi-wing houses—not CBD specialists underestimating garage-to-mudroom hauls.`,
        `Saturday-friendly routing when rugby and cricket swallow weekdays; honest ETAs around fixture traffic.`,
        `Pet-aware quoting—mention breeds early so vacuum passes match shedding reality.`,
        `Estate-literate briefs: boom protocols, contractor tags, and remote gates ride forward visit to visit.`,
        `Transparent cleaning prices in Wynberg online—screenshot totals before convincing teens to fund oven add-ons.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Wynberg`,
    },
    {
      type: "paragraph",
      content: `Kenilworth, Plumstead, and Bergvliet rotate through shared routes—similar garage-forward homes where mentioning pets upfront prevents allergy surprises. Heavy reset? Cross-check [deep cleaning](/services/deep-cleaning-cape-town) detail before choosing add-ons.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Wynberg?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near me in Wynberg should expect bougainvillea debris and rugby-boot mud—not guess suburban driveway widths. Shalean maps cleaning services in Wynberg across Kenilworth and Plumstead loops, so near-me searches surface realistic ETAs. Open [booking](/booking), declare every bedroom study doubling as a spare room, and cleaning prices in Wynberg render before checkout.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Wynberg clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Head to [instant quote](/booking)—pet notes and estate gate codes stick with the dispatch brief.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Wynberg or neighbouring Southern Suburbs coverage.`,
        `Count bedrooms, bathrooms, and mudrooms honestly—pets change vacuum math.`,
        `Choose standard, deep, move-out, or Airbnb cleaning to match inventory or guest pressure.`,
        `Pick a slot around school sport; mention estate decals if security slows arrivals.`,
        `Review cleaning prices in Wynberg online, pay once scope matches the house.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Wynberg?`,
          answer: `Most homes confirm within several days once baths and pets are declared—Tuesday/Wednesday visits rebound after muddy Saturday sport consumes weekend crews. Book mudroom crises early; Thursday panic competes with every other rugby family.`,
        },
        {
          question: `How much does a typical 3-bedroom house cost to clean in Wynberg?`,
          answer: `Three-bedroom, two-bath suburban sweet spots often land near R560–R780 depending on pets and gravel drives—bonus bathrooms or braai patios climb from there. Refresh totals live as you edit the booking flow.`,
        },
        {
          question: `Why does pet hair affect quoted cleaning time?`,
          answer: `Heavy shedders need repeated vacuum passes, skirting brush-outs, and upholstery lint checks—minutes stack faster than “quick tidy” guesses. Mention breeds when booking so labour matches reality.`,
        },
        {
          question: `Can I compare fortnightly vs once-off pricing online?`,
          answer: `Toggle scopes in the booking flow—each change refreshes totals instantly for spouses or estate managers. Fortnightly upkeep rarely halves a deep reset; chemistry differences stay visible.`,
        },
        {
          question: `What if my estate requires contractor clearance?`,
          answer: `Paste clearance rules, decal requirements, or PIN refresh cadence into notes; dispatch verifies compliance before arrival so boom gates don’t eat half your hour.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Enter accurate bathrooms and pets, pick tier and extras, choose a realistic slot, checkout once itemised totals align—digital receipts beat cash when estates audit contractors.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Wynberg reward honest bathroom counts and pet notes—crews arrive stocked for suburban wings, not studio shortcuts.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Wynberg`,
      description: `Garden-home quotes without guesswork.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-green-point-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in Green Point stack stadium-adjacent energy with Seaboard humidity—book online with upfront pricing and calendars tuned for concierge choreography, lift queues, and humid grease that bonds overnight. Layer [Airbnb cleaning](/services/airbnb-cleaning-cape-town) beside [standard cleaning](/services/standard-cleaning-cape-town), then confirm totals via [instant quote](/booking) before guests WhatsApp Monday resets. Event weekends steal slots fastest; quiet Tuesdays often reopen mid-week sparkle.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Green Point: lifts, humidity & coastal grit`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Green Point behave like Sea Point—only with more stadium-week spikes and humidity sticking grease down. One-bedroom, one-bathroom apartments commonly land near R440–R660 for standard visits when balconies stay manageable. Two-bedroom, two-bathroom units along Somerset or Main adjacency typically print R660–R880 once lifts and basement logistics are honest. Three-bedroom penthouses or triple-bath layouts frequently ride R880–R970+ before balcony blow-outs or [carpet cleaning](/services/carpet-cleaning-cape-town) add-ons.`,
    },
    {
      type: "paragraph",
      content: `Humidity lengthens oven degrease dwell time; concert grit coats rails faster than weekday dust. Move-out scopes spike when sectional councils photograph grout under harsh LEDs—pick [move-out cleaning](/services/move-out-cleaning-cape-town) deliberately, not as renamed standard. Compare cadence via [standard cleaning](/services/standard-cleaning-cape-town) versus [deep cleaning](/services/deep-cleaning-cape-town), then confirm totals in [booking](/booking).`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Green Point`,
    },
    {
      type: "bullet_list",
      items: [
        `Stacked bathrooms & duplex layouts—each wet room adds sanitising loops even when bedrooms stay compact.`,
        `Event residue—stadium weekends coat balconies and kitchens differently than ordinary Seaboard grit.`,
        `Humidity chemistry—grease films bond tighter, slowing oven and backsplash passes unless booked as deep.`,
        `Concierge & lift choreography—visitor discs, loading zones, and noisy-hour bylaws shrink workable minutes unless briefed.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Deep cleaning — Targets post-event kitchens, bathroom polish, grout refresh, and detail dusting once humidity traps grime—book before listing shoots or allergy flare-ups.`,
        `Standard cleaning — Keeps finishes guest-ready between deeper resets when body corporates police noise and elevator etiquette.`,
        `Move-out cleaning — Inventory-aware detailing across cupboards, ovens (when selected), wet rooms, and floors—timed around basement bay bookings.`,
        `Airbnb cleaning — Linen-adjacent surfaces, polished bathrooms, rubbish cleared—ideal when guest reviews hinge on photo-ready wet zones.`,
        `Carpet cleaning — Soft floors where coastal grit meets nightly entertaining—schedule after major events or humid stretches.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Green Point homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Airbnb hosts book Monday resets after stadium weekends glaze balconies with ash and lobby carpets with grit. Tenants sync exit cleans with basement bay reservations and lift-blackout bylaws. Families book when Thursday harbour events leave Friday kitchens unlaunchable for school lunches. Landlords book before drone shoots when salty glass dulls Atlantic views. New owners book deep passes before listing portals syndicate outdated grime photography.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Concierge-literate crews—visitor discs, loading zones, and remote briefings arrive before knock.`,
        `Humidity-aware chemistry choices so ovens and backsplashes don’t fog ten minutes after closing doors.`,
        `Turnover slots aligned with notorious Somerset and Main Road check-in waves—not surprise midday gaps.`,
        `Quote honesty: stacked bathrooms update totals live; stadium-week scarcity shows as calendar truth, not mystery fees.`,
        `Host-ready rubbish sequencing and wet-zone polish that survives photo-first guest reviews.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Green Point`,
    },
    {
      type: "paragraph",
      content: `Sea Point, Fresnaye, and City Bowl edges rotate through shared dispatch—similar vertical logistics where concise basement directions save 15 minutes. Selling soon? Pair periodic visits with intel from [move-out cleaning](/services/move-out-cleaning-cape-town) before buyers tour.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Green Point?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near me in Green Point should decode basement directions—not tour in from Paarl guessing loading bays. Shalean ties cleaning services in Green Point to Seaboard routing shared with Sea Point edges, so near-me searches surface realistic ETAs around stadium peaks. Pin your building in [booking](/booking), flag humid-week grease honestly, and cleaning prices in Green Point appear before you swipe.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Green Point clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Open [booking](/booking)—concierge notes and lift quirks travel with the job sheet.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Green Point or neighbouring Seaboard coverage.`,
        `Enter bedrooms, bathrooms, and duplex stacks honestly—each wet room loops labour.`,
        `Pick standard, deep, move-out, or Airbnb cleaning to match guest or sectional pressure.`,
        `Choose a slot around noisy-hour bylaws; mention event weekends if calendars compress.`,
        `Review cleaning prices in Green Point online, checkout once scope matches the unit.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Green Point?`,
          answer: `Most buildings confirm within several days once baths and concierge notes are accurate—stadium and concert stacks consume Sunday-to-Monday turnovers fastest. Book post-event resets immediately; quiet mid-week mornings rebound sooner than frantic Saturday requests.`,
        },
        {
          question: `How much does a 2-bedroom apartment cost to clean in Green Point?`,
          answer: `Two-bedroom, two-bathroom stacks along Somerset or Main adjacency often land near R660–R880 once lifts and basement logistics are honest—humid weeks can nudge oven chemistry upward. Refresh totals as you tick stacked baths.`,
        },
        {
          question: `How does event weekend pricing differ from quiet weeks?`,
          answer: `Rates still derive from bedrooms, bathrooms, scope, and extras—events show up as calendar scarcity, not hidden surcharges. Slots vanish faster when crowds stack; planning beats last-minute panic.`,
        },
        {
          question: `Why did humidity trigger a higher oven-clean add-on?`,
          answer: `Moist Seaboard air polymerises grease; technicians need safer dwell cycles so glass doesn’t fog minutes after closing the door—approve upfront so crews aren’t rushed into smoke alarms.`,
        },
        {
          question: `What’s the earliest realistic turnover after a late guest checkout?`,
          answer: `Trust the live calendar—it factors lift queues, bylaws, and drying time. Promising noon sparkle after midnight checkout ignores loading-bay traffic; pick the earliest honest slot and tell guests clearly.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Enter stacked bathrooms and concierge quirks, pick tier and extras, choose a compliant time slot, pay once itemised totals align—receipts stay audit-friendly for co-host splits.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Green Point pair humid-air realism with lift choreography—honest bathroom counts keep Mondays guest-ready without hallway drama.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Green Point`,
      description: `Host-ready quotes with Seaboard savvy.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),

  hub("cleaning-services-durbanville-cape-town", [
    {
      type: "paragraph",
      content: `Cleaning services in Durbanville favour braai patios, estate gatehouses, and mudrooms that swallow winter boots—book online with square-metre honesty, not studio defaults. Heavy resets route through [deep cleaning](/services/deep-cleaning-cape-town); steady cadence locks via [standard cleaning](/services/standard-cleaning-cape-town)—both resolve in [instant quote](/booking) once every bathroom is counted. School-holiday Saturdays vanish early; weekday visits while kids sit in class stay easier to secure.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Cleaning prices in Durbanville: four beds aren’t a Sea Point flat`,
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Durbanville jump once square metres and bathrooms multiply. A compact three-bedroom townhouse with two bathrooms often lands near R520–R720 for recurring standard work when mudrooms behave. Four-bedroom, three-bathroom homes—the Northern Suburbs norm—typically print R780–R950 once every wet room gets proper sanitising. Five-bedroom estate stock with bonus lounges or pool baths pushes R950–R1,050+ before interior ovens, chandelier-adjacent dusting, or [carpet cleaning](/services/carpet-cleaning-cape-town).`,
    },
    {
      type: "paragraph",
      content: `Smaller duplexes sit lower in the band; rambling single-storeys with double garages climb because vacuum passes repeat across wings. Renovation dust or post-holiday carnivals eats deep-tier chemistry—compare [standard cleaning](/services/standard-cleaning-cape-town) with [deep cleaning](/services/deep-cleaning-cape-town) honestly. Sellers aligning show days should pair photography timelines with [move-out cleaning](/services/move-out-cleaning-cape-town)-grade detailing.`,
    },
    {
      type: "heading",
      level: 2,
      content: `What affects cleaning time and cost in Durbanville`,
    },
    {
      type: "bullet_list",
      items: [
        `Wing count & bathrooms—teenagers hiding in every spare room still mean real baths to sanitise; miscounting explodes on-site reality.`,
        `Garden-to-mudroom pathways—estate plots track dust faster than apartment corridors.`,
        `Extras—double-volume dusting, interior windows, ovens, and pet deodorising queue after core rooms.`,
        `Estate logistics—gatehouses, contractor decals, and school-run traffic determine whether hour one starts cleaning or queuing.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `What your booking covers (service by service)`,
    },
    {
      type: "bullet_list",
      items: [
        `Deep cleaning — Coordinated resets across multiple bathrooms, kitchens, lounges, and staircases after holidays, renovations, or neglected quarters—choose when standard wipes stop moving grime.`,
        `Standard cleaning — Keeps large footprints manageable between seasonal scrubs: kitchens, baths, floors, dusting on cadence.`,
        `Move-out cleaning — Buyer- and landlord-ready detailing with cupboard wipes, oven scope (when selected), and wet rooms tuned to inspection lenses.`,
        `Airbnb cleaning — Estate-complex turnovers with boom protocols, linen-ready wet zones, and rubbish cleared before next guests.`,
        `Carpet cleaning — Lounges where kids, dogs, and garden dust compound—schedule after rainy winters or shedding peaks.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `When Durbanville homes usually need professional cleaning`,
    },
    {
      type: "paragraph",
      content: `Tenants book when braai patios and pet zones fail inspection lenses despite DIY shampooing. Airbnb hosts book ahead of December arrivals when linen cupboards surrender. Families book after Saturday sport coats every bathroom before Sunday roasts. Landlords book between tenants when mudrooms still smell like last winter’s boots. Sellers book before drone shoots when Wine Route–adjacent patios must sparkle without borrowing neighbour pressure washers.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Why Cape Town homeowners and hosts choose Shalean`,
    },
    {
      type: "bullet_list",
      items: [
        `Multi-wing crews with ladders and pole kits flagged for double-volume dust—not dining-chair improvisation.`,
        `Estate gatehouse literacy: contractor decals, PIN refreshes, and trailer-friendly directions ride with dispatch.`,
        `Weekday deep options when school runs keep hallways quieter than Saturday chaos.`,
        `Northern Suburbs pricing honesty—extra bathrooms and teen-filled wings stay visible before payment.`,
        `Airbnb-ready rubbish sequencing for estate complexes where boom queues threaten narrow turnover gaps.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Areas we serve around Durbanville`,
    },
    {
      type: "paragraph",
      content: `Bellville, Brackenfell, and Plattekloof share routing DNA—similar driveway lengths where mentioning trailer-friendly access prevents surprises. Soft-floor refreshes? Align expectations via [carpet cleaning](/services/carpet-cleaning-cape-town) before ticking boxes.`,
    },
    {
      type: "heading",
      level: 2,
      content: `Looking for cleaners near you in Durbanville?`,
    },
    {
      type: "paragraph",
      content: `Cleaners near me in Durbanville should size multi-wing houses—not flatten six rooms into coastal averages. Shalean routes cleaning services in Durbanville alongside Bellville and Brackenfell loops, so near-me searches surface trailer-aware ETAs. Plug your estate into [booking](/booking), declare every bathroom including the pool shower, and cleaning prices in Durbanville render before you pay.`,
    },
    {
      type: "heading",
      level: 2,
      content: `How to book a Durbanville clean (step-by-step)`,
    },
    {
      type: "paragraph",
      content: `Use [instant quote](/booking)—gatehouse rules and double-volume notes stay attached to dispatch.`,
    },
    {
      type: "numbered_list",
      items: [
        `Confirm Durbanville or neighbouring Northern Suburbs coverage.`,
        `Walk the house once: bedrooms, every bath, studies posing as bedrooms, mudrooms.`,
        `Pick standard, deep, move-out, or Airbnb cleaning aligned with inspection or guest clocks.`,
        `Choose weekday slots when schools run if you need quieter hallways; Saturdays for deep resets book early.`,
        `Review cleaning prices in Durbanville online, checkout when scope matches the estate layout.`,
      ],
    },
    {
      type: "heading",
      level: 2,
      content: `Frequently asked questions`,
    },
    {
      type: "faq",
      omit_section_heading: true,
      items: [
        {
          question: `How quickly can I book a cleaner in Durbanville?`,
          answer: `Large homes usually lock within several days once bathrooms and wings are accurate—holiday Saturdays disappear two weeks ahead. Mid-week visits while kids sit in class rebound faster than Friday panic.`,
        },
        {
          question: `How much does a four-bedroom house cost to clean in Durbanville?`,
          answer: `Four-bedroom, three-bathroom Northern stock often prints R780–R950 once each wet room gets proper sanitising—pool baths and bonus lounges climb from there. The booking flow animates totals as you edit.`,
        },
        {
          question: `Why does my quote exceed coastal flat ranges?`,
          answer: `You’re buying more scrub minutes: extra bathrooms, garage-to-mudroom transitions, teen wings, and garden dust loads exceed Seaboard two-beds. Flattening Northern work into coastal averages would force rushed inspections.`,
        },
        {
          question: `Can I estimate cost before counting every bathroom?`,
          answer: `Draft with best guesses, walk the house once updating baths and studies-as-bedrooms—totals refresh instantly so you see whether that spare shower matters more than another lounge vacuum pass.`,
        },
        {
          question: `Do cleaners bring ladders for double-volume spaces?`,
          answer: `Flag double-volume dusting, chandeliers, or loft hatches—dispatch confirms ladders or pole kits before arrival instead of unsafe dining-chair stacks.`,
        },
        {
          question: `How do I book a cleaner?`,
          answer: `Enter every bathroom and estate note, pick tier and extras, choose a realistic slot, pay once itemised totals align—checkout emails suit Airbnb expense claims and landlord audits.`,
        },
      ],
    },
    {
      type: "paragraph",
      content: `Cleaning prices in Durbanville stay tied to wing count and honest baths—gate notes forward so hour one scrubs instead of queuing at booms.`,
    },
    {
      type: "cta",
      title: `Book a cleaner in Durbanville`,
      description: `Large-home quotes grounded in bed/bath reality.`,
      button_text: `Get instant quote`,
      link: `/booking`,
      variant: `primary`,
    },
  ]),
];
