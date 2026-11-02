import type { Lesson } from "./lesson";

/**
 * A hand-checked example lesson. Used by tests, by the UI without an API key,
 * and as the worked example in the generation prompt.
 */
export const EXAMPLE_LESSON: Lesson = {
  engine: "circuits",
  title: "Series vs parallel: where does the brightness go?",
  year_level: 10,
  objective: "Explain why bulbs in series share the battery's voltage while bulbs in parallel each get all of it.",
  key_ideas: [
    "Current is the same everywhere in a series loop.",
    "In series, the battery's voltage is shared between the bulbs.",
    "In parallel, each branch gets the full battery voltage.",
  ],
  scenes: [
    {
      heading: "Two bulbs in series",
      intro: "Here are two identical bulbs in one loop with a 9 V battery. Before you close the switch, predict: will they be as bright as one bulb on its own?",
      board: {
        parts: [
          { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
          { id: "sw", kind: "switch", x: 8, y: 3, rot: 0, closed: false },
          { id: "b1", kind: "bulb", x: 13, y: 3, rot: 0, ohms: 24 },
          { id: "b2", kind: "bulb", x: 17, y: 7, rot: 1, ohms: 24 },
        ],
        wires: [
          { id: "w1", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 7, y: 3 }] },
          { id: "w2", points: [{ x: 9, y: 3 }, { x: 12, y: 3 }] },
          { id: "w3", points: [{ x: 14, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 6 }] },
          { id: "w4", points: [{ x: 17, y: 8 }, { x: 17, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] },
        ],
      },
      explain: {
        simple: "Think of the battery as giving each bit of charge a fixed amount of energy. With two bulbs in a row, that energy gets split between them, so each one glows less.",
        intermediate: "The current is the same through both bulbs. The battery's 9 V is shared, so each identical bulb has about half the voltage across it and transfers less energy each second.",
        advanced: "With R_total = R1 + R2, I = V / (R1 + R2). Each bulb's power is P = I²R, so two equal bulbs in series each dissipate a quarter of what one bulb alone would.",
      },
      try_this: ["Close the switch and click each bulb to compare voltages.", "Change one bulb to 48 Ω. Which one is brighter now?"],
    },
    {
      heading: "Make both bulbs full brightness",
      intro: "Now the bulbs are in series again. Your job: rewire them so each one gets the full 9 V and glows brightly.",
      board: {
        parts: [
          { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
          { id: "b1", kind: "bulb", x: 11, y: 5, rot: 0, ohms: 24 },
          { id: "b2", kind: "bulb", x: 11, y: 9, rot: 0, ohms: 24 },
        ],
        wires: [
          { id: "w1", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 5 }, { x: 10, y: 5 }] },
          { id: "w2", points: [{ x: 12, y: 5 }, { x: 14, y: 5 }, { x: 14, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 9 }, { x: 10, y: 9 }] },
          { id: "w3", points: [{ x: 12, y: 9 }, { x: 16, y: 9 }, { x: 16, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] },
        ],
      },
      challenge: {
        title: "Full brightness for both",
        goal: "Get at least 300 mA through each bulb.",
        checks: [
          { kind: "current_between", part_id: "b1", min_ma: 300, max_ma: 450 },
          { kind: "current_between", part_id: "b2", min_ma: 300, max_ma: 450 },
        ],
        hint_if_stuck: "Each bulb needs its own path from the + side of the battery to the − side.",
        success: "Both bulbs at full brightness. That's a parallel circuit.",
        allowed_edits: ["rewire", "move_parts"],
      },
      explain: {
        simple: "Give each bulb its own road back to the battery, and each gets the battery's full push.",
        intermediate: "In parallel, each branch is connected directly across the battery, so each bulb has the full 9 V. The battery supplies the sum of the branch currents.",
        advanced: "Branch currents are I = V/R each, so I_total = V/R1 + V/R2. Equivalent resistance is 1/R_eq = 1/R1 + 1/R2: adding a branch lowers it.",
      },
      try_this: ["Delete one bulb's wire. Does the other one change?", "Watch the battery's current as you add the second branch."],
    },
  ],
  questions: [
    {
      question: "Two identical bulbs are in series with a 9 V battery. About how much voltage is across each bulb?",
      choices: ["9 V", "4.5 V", "18 V", "0 V"],
      answer_index: 1,
      explanation: "In series the battery's voltage is shared, so identical bulbs get about half each.",
    },
    {
      question: "You add a third bulb in parallel. What happens to the current from the battery?",
      choices: ["It goes down", "It stays the same", "It goes up", "It becomes zero"],
      answer_index: 2,
      explanation: "Each new parallel branch draws its own current, so the total from the battery rises.",
    },
  ],
  teacher_notes: "Common misconception: current gets 'used up' by the first bulb. Ask students to click both series bulbs and compare currents. Extension: what happens to the battery's life with more parallel bulbs?",
};

/** A hand-checked motion lesson: the worked example for motion generation, and a test fixture. */
export const MOTION_EXAMPLE: Lesson = {
  engine: "motion",
  title: "Launch angles: how far will it fly?",
  year_level: 10,
  objective: "Explain how launch speed and angle set a projectile's range, and why gravity's strength matters.",
  key_ideas: [
    "Gravity pulls a projectile down the whole time; its sideways speed stays the same without air resistance.",
    "Faster launches go further. On flat ground, 45° gives the longest range.",
    "Weaker gravity means a longer flight time, so the same throw goes much further.",
  ],
  scenes: [
    {
      heading: "Which angle goes furthest?",
      intro: "This tennis ball is launched at 15 m/s. Predict which angle will throw it furthest, then test angles from low to high.",
      motion: { kind: "projectile", planet: "earth", body: "ball", speed: 15, angle: 20, height: 0, air: false, editable: ["angle"] },
      explain: {
        simple: "Throw too flat and the ball hits the ground before it gets far. Throw too steep and it goes up but not along. Somewhere in between is the sweet spot.",
        intermediate: "The launch speed splits into a horizontal part (which carries it along) and a vertical part (which keeps it in the air). 45° balances the two, so the range is greatest.",
        advanced: "With no air resistance, range R = v² sin(2θ) / g, which is largest when sin(2θ) = 1, so θ = 45°. Angles equally either side of 45° (30° and 60°) give the same range.",
      },
      try_this: ["Compare 30° and 60°. What do you notice about their ranges?", "Watch the speed graph: when is the ball slowest, and why isn't it zero?"],
    },
    {
      heading: "Hit the target",
      intro: "Now you control both the speed and the angle. Land the ball in the green zone.",
      motion: {
        kind: "projectile", planet: "earth", body: "ball", speed: 10, angle: 30, height: 0, air: false, target_x: 22, target_width: 3, editable: ["speed", "angle"],
        challenge: { title: "Bullseye", goal: "Land the ball in the green zone 22 m away.", checks: [{ kind: "hit_target" }], hint_if_stuck: "Set the angle to 45°, then adjust the speed.", success: "Right on target!" },
      },
      explain: {
        simple: "There's more than one way to hit the target: a fast flat throw or a slower lob can both land in the same spot.",
        intermediate: "Range depends on both speed and angle. Many speed-angle pairs give the same range, but 45° needs the least speed.",
        advanced: "At 45°, R = v²/g, so v = √(gR) = √(9.81 × 22) ≈ 14.7 m/s. At other angles you need a higher speed to reach the same range.",
      },
      try_this: ["Find two different angles that both hit the target.", "Which of your hits spent longest in the air?"],
    },
    {
      heading: "A throw on the Moon",
      intro: "Gravity on the Moon is about one sixth of Earth's. Throw the ball 60 to 80 m on the Moon.",
      motion: {
        kind: "projectile", planet: "moon", body: "ball", speed: 5, angle: 45, height: 0, air: false, editable: ["speed"],
        challenge: { title: "Moon throw", goal: "Throw the ball between 60 and 80 m on the Moon.", checks: [{ kind: "distance_between", min: 60, max: 80 }], hint_if_stuck: "Range grows with the square of speed: doubling the speed gives four times the range.", success: "That's a giant leap!" },
      },
      explain: {
        simple: "On the Moon, gravity pulls more gently, so the ball stays up longer and travels further before landing.",
        intermediate: "Weaker gravity means the ball takes longer to rise and fall. Its horizontal speed is the same, so more time in the air means more distance.",
        advanced: "R = v² sin(2θ) / g. With g = 1.62 m/s² instead of 9.81 m/s², the same throw goes about 6 times further.",
      },
      try_this: ["Switch your throw to Earth. How far does it go now?", "How does the time in the air compare?"],
    },
  ],
  questions: [
    {
      question: "Ignoring air resistance, which launch angle gives the longest range on flat ground?",
      choices: ["30°", "60°", "45°", "90°"],
      answer_index: 2,
      explanation: "45° balances horizontal speed and time in the air.",
    },
    {
      question: "A ball is thrown horizontally. While it flies (no air resistance), what happens to its horizontal speed?",
      choices: ["It stays the same", "It increases", "It decreases", "It drops to zero at the top"],
      answer_index: 0,
      explanation: "No horizontal force acts, so horizontal speed doesn't change. Only the vertical speed changes.",
    },
    {
      question: "The same throw is made on the Moon. Why does it go further?",
      choices: ["The ball is lighter there", "There's more air", "It's launched faster", "Weaker gravity keeps it in the air longer"],
      answer_index: 3,
      explanation: "Mass doesn't change and the Moon has no air; weaker gravity means more time in the air.",
    },
  ],
  teacher_notes: "Misconception: heavier objects fall faster. Ask students to switch to the shot put in the free lab and compare. Extension: turn on air resistance and find the new best angle (lower than 45°).",
};

/** A hand-checked populations lesson: the worked example for population generation, and a test fixture. */
export const POP_EXAMPLE: Lesson = {
  engine: "populations",
  title: "Predators, prey and pest control in Aotearoa",
  year_level: 11,
  objective: "Explain how food limits population growth, how predator and prey numbers affect each other, and why pest control must be sustained.",
  key_ideas: [
    "With plenty of room a population grows faster and faster, then levels off at the carrying capacity as food and space run short.",
    "Predator numbers follow prey numbers: more prey feeds more predators, which then eat the prey down.",
    "Trapping only works while it continues and removes predators faster than they can breed.",
  ],
  scenes: [
    {
      heading: "Room to grow",
      intro: "Twenty rabbits arrive in an empty valley that can feed 3,000. Predict the shape of the graph, then run it.",
      population: { prey_name: "rabbits", predator_name: null, prey_start: 20, predator_start: 0, growth: 1, capacity: 3000, hunting: 0, conversion: 0, predator_death: 0, trapping: 0, harvest: 0, control_start: 0, years: 20, editable: ["growth", "capacity"], challenge: null },
      explain: {
        simple: "At first there's loads of grass, so every rabbit family adds more rabbits. Later, food runs short and the numbers stop climbing.",
        intermediate: "Growth is close to exponential while resources are plentiful. As the population nears the carrying capacity, competition for food slows growth until births balance deaths.",
        advanced: "Logistic growth: dN/dt = rN(1 − N/K). Growth is fastest at N = K/2, and the solution is N(t) = K / (1 + ((K − N₀)/N₀)e^(−rt)).",
      },
      try_this: ["Double the growth rate. Does the final number change, or just how fast it gets there?", "Halve the carrying capacity. What happens to the curve?"],
    },
    {
      heading: "Enter the stoats",
      intro: "Stoats were brought to New Zealand in the 1880s to control rabbits. Watch how the two populations affect each other.",
      population: { prey_name: "rabbits", predator_name: "stoats", prey_start: 2000, predator_start: 20, growth: 1, capacity: 5000, hunting: 150, conversion: 0.02, predator_death: 0.6, trapping: 0, harvest: 0, control_start: 0, years: 60, editable: ["hunting", "predator_death"], challenge: null },
      explain: {
        simple: "Lots of rabbits means lots of food for stoats, so stoats increase. Then they eat so many rabbits that food runs short, and the stoats decline. Round and round it goes.",
        intermediate: "Predator numbers lag behind prey numbers. The cycles get smaller over time as both populations settle towards a balance point.",
        advanced: "Lotka–Volterra predation with logistic prey: dP/dt = b·a·N·P − m·P. The balance point is N* = m/(b·a): prey numbers there are set by the predators' biology, not the prey's.",
      },
      try_this: ["Switch to the rabbits vs stoats view. What shape does the path make?", "Make stoats better hunters. Do rabbits settle higher or lower?"],
    },
    {
      heading: "Bring the birds back",
      intro: "Stoats also prey on native birds. Here they're holding a bird population at 300. Plan a trapping campaign to bring the birds back.",
      population: {
        prey_name: "native birds", predator_name: "stoats", prey_start: 300, predator_start: 25.5, growth: 0.6, capacity: 2000, hunting: 40, conversion: 0.0833, predator_death: 0.5, trapping: 0, harvest: 0, control_start: 5, years: 50, editable: ["trapping", "control_start"],
        challenge: { title: "Bring the birds back", goal: "Get the bird population to at least 900 by year 50.", checks: [{ kind: "final_between", species: "prey", min: 900, max: 2000 }], hint_if_stuck: "Light trapping isn't enough: the stoats breed back. Try trapping most of them each year.", success: "The birds are recovering!" },
      },
      explain: {
        simple: "Trap a few stoats and the rest soon breed to fill the gap. Trap most of them, every year, and the birds get a real chance.",
        intermediate: "Trapping adds to the predators' death rate. If it's high enough, predators decline faster than they can breed, and prey recover towards the carrying capacity.",
        advanced: "Trapping fraction f adds a removal rate T = −ln(1 − f), raising the prey balance point to N* = (m + T)/(b·a). Predators die out when b·a·K < m + T.",
      },
      try_this: ["Find the smallest trapping level that works.", "Start trapping later. Does it still work by year 50?"],
    },
  ],
  questions: [
    {
      question: "A rabbit population levels off even with no predators. Why?",
      choices: ["They run out of food and space", "Rabbits stop breeding when they're old", "The weather changes", "Rabbits can only live 20 years"],
      answer_index: 0,
      explanation: "Competition for limited resources slows growth until births balance deaths: the carrying capacity.",
    },
    {
      question: "In a predator–prey cycle, when do predator numbers usually peak?",
      choices: ["Before the prey peak", "At exactly the same time as the prey", "Only when prey are extinct", "Shortly after the prey peak"],
      answer_index: 3,
      explanation: "Predators need time to breed on plentiful food, so their peak lags behind the prey peak.",
    },
    {
      question: "Why does trapping a small fraction of stoats each year barely help the birds?",
      choices: ["Traps catch birds too", "The stoats breed back faster than they're removed", "Stoats avoid traps forever", "Birds don't need protection"],
      answer_index: 1,
      explanation: "Unless removal outpaces breeding, the stoat population recovers and keeps eating birds.",
    },
  ],
  teacher_notes: "The model is simplified: real stoats eat many prey species (rabbits, rats, birds), so they don't depend on one prey. Link to Predator Free 2050 and local trapping groups. Misconception: one big trapping effort fixes the problem; ask students to stop trapping after year 30 in the free lab and watch what happens.",
};
