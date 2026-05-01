NEW_INSIGHTS = """const AUTO_INSIGHTS = [
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"⚡",
    title:"Agriculture: Zero Software Layer — Massive White Space",
    whyMatters:"Farmers generate petabytes of sensor data yearly with no software to monetize it — the intelligence layer is completely unbuilt across 9 hardware players.",
    reason:"9 hardware manufacturers serve agriculture robotics but only 1 dedicated software company (Trimble, at $17B). The AI farm management and data intelligence layer is virtually unclaimed.",
    implication:"As hardware commoditizes, whoever owns the software layer controls data, margins, and farmer lock-in. Current gap is a 9:1 hardware-to-software ratio.",
    action:"Build or back an AI-native farm intelligence platform aggregating data from existing hardware. Target autonomous weeding, crop health AI, and yield optimization SaaS.",
    sector:"Agriculture",vcl:"Software & AI",premium:false,
    confidence:"High",timeSensitivity:"Immediate",
    dataBasis:"Based on 13 companies in Agriculture: 9 in Manufacturers (69%) vs 1 in Software & AI (8%). Imbalance ratio 9:1. 0 companies in Design or Integration & Services. Hardware ecosystem is mature — software is the only missing layer.",
    companyRecs:[
      {name:"Trimble Agriculture",tag:"Leader",reason:"Only existing software player — benchmark or acquisition target for any new entrant"},
      {name:"John Deere (Blue River)",tag:"Enabler",reason:"Owns farm hardware distribution; actively needs software intelligence partners"},
      {name:"Iron Ox",tag:"Emerging",reason:"Indoor farming data platform with robotics integration — natural software ally"},
      {name:"FarmWise",tag:"Emerging",reason:"Weeding robot generating crop-level data; software layer is their next unlock"}
    ],
    indiaImpact:{
      level:"High",
      why:"India has 140M+ farm holdings — highest in the world. Precision agriculture software could unlock $15B+ in productivity gains. ICAR and state govts fund agri-tech with the Digital Agriculture Mission.",
      companies:[
        {name:"CropIn",reason:"AI farm management SaaS — direct beneficiary of ag robotics data streams"},
        {name:"DeHaat",reason:"Full-stack agri platform serving 1M+ farmers — ready distribution for software"},
        {name:"Ninjacart",reason:"Farm-to-retail supply chain digitization; robotics data improves sourcing accuracy"},
        {name:"Intello Labs",reason:"Computer vision for crop quality — adjacent to robotics data pipelines"},
        {name:"AgroStar",reason:"Digital agri advisory with 5M+ farmer base — AI layer integration target"}
      ]
    }
  },
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"🚀",
    title:"Space: No AI/Software Layer Despite Growing Hardware Base",
    whyMatters:"Space hardware is scaling faster than any software can control it — orbital congestion becomes a crisis without autonomy software, and no one is building it.",
    reason:"8 space robotics companies exist (SpaceX at $350B, Rocket Lab at $3B, Maxar at $6.4B) yet zero companies occupy the Software & AI or System Integration layer for space robotics.",
    implication:"Orbital autonomy, satellite swarm management, and mission-control AI are structurally absent. Hardware investment is racing ahead of its enabling software.",
    action:"Target orbital autonomy platforms, on-orbit robotic task scheduling, or space robotics-as-a-service. SpaceX's scale creates a natural enterprise customer.",
    sector:"Space",vcl:"Software & AI",premium:false,
    confidence:"High",timeSensitivity:"Emerging",
    dataBasis:"Based on 8 companies in Space: 0 in Software & AI (0%), 3 in Manufacturers (38%), 3 in Design (38%), 2 in Components & Subsystems (25%). Absolute zero in the software layer despite $359B+ in hardware valuations.",
    companyRecs:[
      {name:"SpaceX",tag:"Enabler",reason:"$350B anchor customer with zero dedicated software vendor — massive procurement pipeline"},
      {name:"Rocket Lab",tag:"Enabler",reason:"$3B public company scaling launches rapidly; needs mission orchestration software"},
      {name:"Starfish Space",tag:"Emerging",reason:"On-orbit servicing pioneer at $30M — natural first software partner"},
      {name:"Maxar Technologies",tag:"Leader",reason:"$6.4B satellite infrastructure operator; needs autonomy overlay across its fleet"}
    ],
    indiaImpact:{
      level:"Medium",
      why:"ISRO's IN-SPACe commercialization push is creating demand for space autonomy software. India's $6B space economy target by 2030 needs enabling software infrastructure that doesn't yet exist domestically.",
      companies:[
        {name:"Pixxel",reason:"Hyperspectral satellite startup — direct customer for on-orbit AI software"},
        {name:"Skyroot Aerospace",reason:"Private launch vehicle company — will need mission orchestration software"},
        {name:"GalaxEye",reason:"Multi-sensor satellite imaging — AI software layer for data interpretation"},
        {name:"Bellatrix Aerospace",reason:"Space propulsion startup; growth will demand mission management software"},
        {name:"Agnikul Cosmos",reason:"3D-printed rockets; scaling missions will demand orchestration software"}
      ]
    }
  },
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"🧠",
    title:"Consumer Robots Have No Operating System — The Android Moment",
    whyMatters:"14 hardware companies building home robots — none have an operating system. Whoever builds the AI platform layer first will own the entire consumer robot ecosystem.",
    reason:"14 consumer robotics companies — all hardware. Zero Software & AI companies exist to unify home robots. China leads hardware (Ecovacs, Roborock, Unitree, Segway-Ninebot) but no AI platform layer exists.",
    implication:"The home robot AI platform (personalization, multi-device orchestration, behavioral AI) is the same gap Android filled for mobile. First mover wins the ecosystem.",
    action:"Build a cross-device AI platform for home robots. Target API integrations with 3-5 hardware OEMs. Monetize via subscription intelligence layer.",
    sector:"Consumer",vcl:"Software & AI",premium:false,
    confidence:"High",timeSensitivity:"Immediate",
    dataBasis:"Based on 14 companies in Consumer: 9 in Manufacturers (64%), 4 in Design (29%), 1 in Semiconductor (7%), 0 in Software & AI. Platform gap confirmed across all 14 tracked companies. Humanoid hardware is shipping now — software demand is immediately active.",
    companyRecs:[
      {name:"Figure AI",tag:"Emerging",reason:"$2.6B humanoid — first major company that will need an AI platform partner at scale"},
      {name:"Unitree Robotics",tag:"Emerging",reason:"$1B Chinese OEM actively seeking software ecosystem partnerships"},
      {name:"Qualcomm",tag:"Enabler",reason:"Edge AI Snapdragon chip — the hardware the software platform will run on"},
      {name:"1X Technologies",tag:"Emerging",reason:"$100M humanoid deploying in workplaces; AI OS layer is their critical gap"}
    ],
    indiaImpact:{
      level:"Medium",
      why:"India's 700M internet users and $500B consumer electronics market create distribution scale. Indian software firms are positioned to build AI middleware as home robot adoption grows globally.",
      companies:[
        {name:"Miko",reason:"Indian consumer robot company — direct beneficiary of an AI platform layer"},
        {name:"Tata Elxsi",reason:"Embedded systems and robotics software — ideal AI middleware builder"},
        {name:"Infosys",reason:"Enterprise AI integration capabilities at scale across OEM partnerships"},
        {name:"Wipro",reason:"Industrial automation software services — natural adjacent capability"},
        {name:"Bosch India",reason:"Consumer and industrial robotics components — hardware enabler"}
      ]
    }
  },
  {
    tag:"watch",tagLabel:"🟡 WATCH",icon:"🤖",
    title:"Humanoid Robot Wave: Software Platform Window is Now",
    whyMatters:"5 humanoid companies raised $4.5B in hardware — none have a software platform. The window to build the Android of robotics is open right now.",
    reason:"5 humanoid companies funded in 3 years: Figure AI ($2.6B), Agility ($400M), 1X ($100M), Apptronik ($350M), Unitree ($1B). Hardware investment totals ~$4.5B with 0 dedicated AI platform plays.",
    implication:"Hardware will commoditize. The winner will be whoever provides the AI reasoning, motion planning, and enterprise integration stack — not the frame and actuators.",
    action:"Monitor for Series B/C rounds. The software/AI platform targeting humanoid deployment in logistics/manufacturing is the highest-leverage unclaimed position.",
    sector:"Consumer",vcl:"Software & AI",premium:false,
    confidence:"Medium",timeSensitivity:"Emerging",
    dataBasis:"Based on 5 humanoid-focused companies across Consumer and Logistics: $4.45B in hardware funding with 0 dedicated AI/software platform companies identified. Medium confidence — software demand peaks 12-18 months after hardware fleet scales.",
    companyRecs:[
      {name:"Figure AI",tag:"Leader",reason:"$2.6B valuation — the benchmark humanoid company to watch and partner with"},
      {name:"Agility Robotics",tag:"Emerging",reason:"$400M, deployed in Amazon warehouses — software integration is the next critical need"},
      {name:"Apptronik",tag:"Emerging",reason:"$350M, partnered with NASA — enterprise software play emerging"}
    ],
    indiaImpact:{
      level:"Low",
      why:"India's $447B manufacturing sector is the eventual deployment target but humanoid robots are 3-5 years from Indian scale. Indian IT majors will build integration middleware as market matures.",
      companies:[
        {name:"Tata Motors",reason:"Manufacturing deployment site — early humanoid pilot candidate"},
        {name:"Infosys",reason:"Enterprise integration middleware for industrial humanoid deployment"},
        {name:"Mahindra",reason:"Industrial manufacturing early adopter for new automation technologies"}
      ]
    }
  },
  {
    tag:"saturated",tagLabel:"🔴 SATURATED",icon:"⚠️",
    title:"Logistics Hardware: 10-Way Battle With Margin Compression Ahead",
    whyMatters:"Amazon and Autostore combined control over 60% of addressable market — new hardware entrants are entering a price war they structurally cannot win.",
    reason:"10 of 20 logistics companies are pure manufacturers competing in the same warehouse AMR/automation space: Amazon, Geek+, Hai, Exotec, Autostore, Locus, ABB, Agility, Apptronik, 6RS.",
    implication:"Amazon Robotics' scale advantage (~$2T parent) and Autostore's grid-patent moat make new pure-hardware entrants structurally disadvantaged. Margins will compress.",
    action:"Avoid pure-play logistics hardware. Seek the software and integration layer instead — only 2 software companies (Plus One, Rapyuta) vs. 10 hardware players.",
    sector:"Logistics",vcl:"Manufacturers",premium:false,
    confidence:"High",timeSensitivity:"Immediate",
    dataBasis:"Based on 20 companies in Logistics: 10 in Manufacturers (50%) vs 2 in Software & AI (10%). Ratio 5:1 hardware-to-software. Amazon Robotics (parent ~$2T) and Autostore ($5B, grid-patent moat) control dominant positions. Saturation is structural, not cyclical.",
    companyRecs:[
      {name:"Plus One Robotics",tag:"Emerging",reason:"Software layer in saturated hardware market — the right bet. $50M funded, growing fast"},
      {name:"Rapyuta Robotics",tag:"Emerging",reason:"Cloud robotics platform — software above the hardware commoditization wave"},
      {name:"Zebra Technologies",tag:"Leader",reason:"Integration services ($13B) — differentiated from pure hardware; strong margin profile"}
    ],
    indiaImpact:{
      level:"High",
      why:"India's $215B logistics market is digitizing rapidly. Flipkart (Walmart), Amazon India, and Meesho are building automated warehouses creating strong domestic demand for software-led logistics intelligence.",
      companies:[
        {name:"GreyOrange",reason:"Indian-origin warehouse robotics company — software differentiation is the key"},
        {name:"Delhivery",reason:"$1.3B listed logistics company actively scaling automation"},
        {name:"Locus.sh",reason:"Logistics AI SaaS company — the software layer play in Indian logistics"},
        {name:"Ecom Express",reason:"Logistics automation early adopter — software procurement pipeline"},
        {name:"ElasticRun",reason:"Rural logistics AI platform — underserved segment with robotics potential"}
      ]
    }
  },
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"🔬",
    title:"Healthcare: No Semiconductor or Components Player for Medical Robotics",
    whyMatters:"No specialized component maker exists for surgical robots — a $380B market sourcing precision parts from general-purpose industrial suppliers.",
    reason:"Intuitive Surgical alone is $150B. Stryker $140B, Medtronic $90B. Zero dedicated semiconductor or components companies serve medical robotics — haptics, micro-actuators, and precision sensors are sourced from general industrial suppliers.",
    implication:"Surgical robots need specialized force-feedback sensors, miniaturized actuators, and haptic chips that general industrial suppliers cannot optimize for. Purpose-built components command 60-80% gross margins.",
    action:"Build or invest in haptic sensing, micro-actuator, or imaging components purpose-built for surgical robotics. Partner with CMR Surgical ($600M) or Vicarious Surgical as early customers.",
    sector:"Healthcare",vcl:"Components & Subsystems",premium:true,
    confidence:"High",timeSensitivity:"Emerging",
    dataBasis:"Based on 14 companies in Healthcare: 8 in Manufacturers (57%), 2 in System Integrators, 1 in Software & AI, 1 in Design, 0 in Components & Subsystems, 0 in Semiconductor. Top 3 surgical robot companies worth $380B+ source all precision components from general industrial suppliers — a documented procurement gap.",
    companyRecs:[
      {name:"Intuitive Surgical",tag:"Leader",reason:"$150B anchor customer for any specialized component provider"},
      {name:"CMR Surgical",tag:"Emerging",reason:"$600M funded — actively seeking precision component partners"},
      {name:"Vicarious Surgical",tag:"Emerging",reason:"Miniaturized robots need specialized components by design — natural first customer"}
    ],
    indiaImpact:{
      level:"Medium",
      why:"India's medical device market ($11B, growing 15% YoY) and surgical tourism hub status create demand. Surat, Pune, and Bangalore clusters have precision engineering capability for medical components.",
      companies:[
        {name:"Wipro GE Healthcare",reason:"Medical device manufacturing — component integration target"},
        {name:"Skanray Technologies",reason:"Medical equipment innovation — adjacent precision engineering"},
        {name:"Poly Medicure",reason:"Medical device manufacturer with existing precision component lines"},
        {name:"Siemens Healthineers India",reason:"Surgical imaging components — strategic partner potential"}
      ]
    }
  },
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"🛡️",
    title:"Defence Semiconductor Gap: Sovereign AI Chip Imperative",
    whyMatters:"Western governments are legislating against foreign chips in weapons systems — zero companies currently serve this policy-mandated, non-cyclical demand.",
    reason:"0 dedicated semiconductor companies in defence robotics. Only Anduril ($8.5B) and Shield AI ($2.8B) cover software. Governments are legislating against foreign chips in autonomous weapons systems.",
    implication:"ITAR compliance and sovereign AI chip requirements will force Western militaries to fund domestic chip development for autonomous systems. This is a policy-backed, non-cyclical demand.",
    action:"Engage defence primes (Northrop $70B, Elbit $9B) as anchor customers for a purpose-built autonomous systems chip. Target DoD SBIR grants and NATO procurement cycles.",
    sector:"Defence",vcl:"Semiconductor",premium:true,
    confidence:"High",timeSensitivity:"Emerging",
    dataBasis:"Based on 14 companies in Defence: 0 in Semiconductor (0%), 2 in Software & AI (14%), 8 in Manufacturers (57%). US CHIPS Act ($52B) and NATO sovereign chip requirements create non-cyclical, policy-mandated demand with zero current supply.",
    companyRecs:[
      {name:"Anduril Industries",tag:"Leader",reason:"$8.5B — natural anchor customer for a defence chip company"},
      {name:"Shield AI",tag:"Enabler",reason:"$2.8B software running on foreign chips — a replacement opportunity"},
      {name:"Northrop Grumman",tag:"Enabler",reason:"$70B prime contractor — defence chip procurement channel at scale"}
    ],
    indiaImpact:{
      level:"High",
      why:"India's $25B defence budget and Atmanirbhar Bharat policy mandate domestic defence chips. DRDO and HAL are actively seeking Indian semiconductor partners for autonomous systems.",
      companies:[
        {name:"BEL (Bharat Electronics)",reason:"Listed defence electronics manufacturer — chip integration target"},
        {name:"Tata Advanced Systems",reason:"Defence manufacturing — chip integration and procurement channel"},
        {name:"Ideaforge",reason:"India's largest military drone maker — domestic chip demand is urgent"},
        {name:"DRDO",reason:"Research and procurement agency for autonomous systems chips"},
        {name:"Sagar Defence Engineering",reason:"Autonomous naval systems — sovereign chip requirement"}
      ]
    }
  },
  {
    tag:"watch",tagLabel:"🟡 WATCH",icon:"🌍",
    title:"EU Agriculture Robotics: Policy Tailwind Creating Investment Window",
    whyMatters:"EU mandates 50% pesticide reduction by 2030 — creating non-discretionary, policy-mandated demand for precision robotics with a hard deadline.",
    reason:"France leads EU ag robotics (Naïo Technologies, Agreenculture). EU Farm-to-Fork strategy mandates 50% pesticide reduction by 2030, directly driving autonomous weeding/precision farming demand.",
    implication:"EU regulatory push creates non-discretionary demand for ag robotics. Most players are early-stage (<50M funded). Entry before 2026 aligns with procurement cycle.",
    action:"Target pre-Series A EU agriculture robotics companies in France, Germany, Netherlands. EU subsidies reduce customer acquisition cost and de-risk hardware sales.",
    sector:"Agriculture",vcl:"Manufacturers",premium:true,
    confidence:"Medium",timeSensitivity:"Emerging",
    dataBasis:"Based on 3 EU-based agriculture robotics companies: Naïo (~40M EUR), Agreenculture (undisclosed), Agrobot (undisclosed) — all pre-Series B. EU Farm-to-Fork 2030 mandate covers 440M consumers. Medium confidence — policy signal is strong but EU procurement timelines are 18-36 months.",
    companyRecs:[
      {name:"Naïo Technologies",tag:"Emerging",reason:"~40M EUR funded — leading EU autonomous farm robot with proven deployments"},
      {name:"FarmWise",tag:"Emerging",reason:"US company expanding into EU — precision weeding with strong agronomy data"},
      {name:"Agreenculture",tag:"Emerging",reason:"EU-native tractor autonomy startup — direct Farm-to-Fork beneficiary"}
    ],
    indiaImpact:{
      level:"Low",
      why:"EU regulatory trends are 3-5 years ahead of India. However, Indian exporters to EU (rice, vegetables) will need to comply with EU sustainability standards, creating indirect demand for precision farming.",
      companies:[
        {name:"Mahindra Agri",reason:"Farm machinery manufacturer — future robotics integrator for EU compliance"},
        {name:"TAFE",reason:"Tractor manufacturer positioned for autonomous upgrades for export markets"}
      ]
    }
  },
  {
    tag:"saturated",tagLabel:"🔴 SATURATED",icon:"🏭",
    title:"Defence Manufacturers: Incumbents Too Entrenched for New Entrants",
    whyMatters:"8 incumbents hold $109B in market cap and 3-7 year certification moats — new hardware entrants face structural impossibility, not just competition.",
    reason:"8 of 14 defence companies are manufacturers with massive incumbents: Northrop ($70B), Textron ($14B), Elbit ($9B), Leonardo ($7.5B), AeroVironment ($4.2B), Kratos ($4.5B).",
    implication:"Defence certifications (MIL-SPEC, ITAR, NATO STANAG) take 3-7 years and $50M+. New hardware entrants cannot economically compete against incumbents with existing contracts.",
    action:"Avoid new defence hardware ventures. The software layer (autonomy stacks, AI decision systems) has only 2 players (Anduril, Shield AI) and is where value is migrating.",
    sector:"Defence",vcl:"Manufacturers",premium:true,
    confidence:"High",timeSensitivity:"Immediate",
    dataBasis:"Based on 14 companies in Defence: 8 in Manufacturers (57%) with combined market cap exceeding $109B (Northrop $70B + Textron $14B + Elbit $9B + Leonardo $7.5B + Kratos $4.5B + AeroVironment $4.2B). MIL-SPEC/ITAR certification timelines 3-7 years. Saturation confirmed.",
    companyRecs:[
      {name:"Anduril Industries",tag:"Leader",reason:"The only new entrant that succeeded — via software-first approach, not hardware"},
      {name:"Shield AI",tag:"Leader",reason:"$2.8B — software wins where hardware cannot enter"}
    ],
    indiaImpact:{
      level:"Medium",
      why:"India's defence imports are $17B/year. Atmanirbhar mandate pushes domestication but Indian defence manufacturers face the same entrenched incumbent problem from global primes.",
      companies:[
        {name:"Ideaforge",reason:"India's drone maker — software differentiation is the only viable path"},
        {name:"BEL",reason:"Listed defence electronics — integration play, not new hardware"},
        {name:"Tata Advanced Systems",reason:"Defence manufacturing JVs with global primes"}
      ]
    }
  },
  {
    tag:"invest",tagLabel:"🟢 INVEST",icon:"🌐",
    title:"Space System Integration: Zero Players for Multi-Mission Orchestration",
    whyMatters:"Space hardware is multiplying but no one is orchestrating multi-mission robotics — a systems gap with no current solution and growing urgency as launch frequency accelerates.",
    reason:"0 system integrators exist in space robotics. As commercial space grows — SpaceX, Rocket Lab, Maxar, ispace — multi-mission coordination, ground-to-orbit robotics management, and in-orbit servicing scheduling are completely unaddressed.",
    implication:"Starfish Space ($30M) hints at the on-orbit servicing need. Full systems integration for commercial space robotic missions is structurally absent and will be mandated as orbital congestion grows.",
    action:"Build the mission-control and systems integration stack for commercial space robotics. Partner with Rocket Lab or Astrobotic for early mission contracts. Leverage NASA COTS as anchor.",
    sector:"Space",vcl:"System Integrators",premium:true,
    confidence:"Medium",timeSensitivity:"Long-term",
    dataBasis:"Based on 8 companies in Space: 0 in System Integrators (0%), 3 in Manufacturers ($353B+ combined), 3 in Design, 2 in Components & Subsystems. As commercial launch frequency grows past 100 missions/year, multi-mission orchestration becomes non-negotiable. Medium confidence — gap is clear but market maturity is 2-4 years out.",
    companyRecs:[
      {name:"SpaceX",tag:"Enabler",reason:"$350B — the anchor customer for any space systems integrator"},
      {name:"Rocket Lab",tag:"Enabler",reason:"$3B public — scaling launches needing mission coordination at pace"},
      {name:"Astrobotic",tag:"Emerging",reason:"$250M — lunar logistics needing systems integration capability"}
    ],
    indiaImpact:{
      level:"Medium",
      why:"ISRO's Chandrayaan and Gaganyaan missions create Indian demand for space systems integration. IN-SPACe framework is attracting commercial space companies who will need integration services.",
      companies:[
        {name:"Skyroot Aerospace",reason:"Private launch — systems integration first customer in India"},
        {name:"Pixxel",reason:"Satellite data — orchestration platform customer as fleet scales"},
        {name:"Bellatrix Aerospace",reason:"Space propulsion — mission software needs as range of missions grow"}
      ]
    }
  }
];"""

content = open('C:/Users/prana/Desktop/Tejas Spire LLP/Robotics Intelligence/robotics-intelligence-platform.html', encoding='utf-8').read()
start = content.index('const AUTO_INSIGHTS = [')
end = content.index('];', start) + 2
new_content = content[:start] + NEW_INSIGHTS + content[end:]
open('C:/Users/prana/Desktop/Tejas Spire LLP/Robotics Intelligence/robotics-intelligence-platform.html', 'w', encoding='utf-8').write(new_content)
print('Done. Total length:', len(new_content))
