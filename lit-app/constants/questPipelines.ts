export type QuestMode = "Neutral" | "Recovery" | "Progress";

export type QuestTemplate = {
  title: string;
  type: string;
  steps: number;
  description: string;
  resourceTags?: Array<"gym" | "food" | "quiet" | "transportation">;
};

export type CategoryPipeline = {
  category: string;
  neutral: QuestTemplate[];
  recovery: QuestTemplate[];
  progress: QuestTemplate[];
};

export const CATEGORY_PIPELINES: Record<string, CategoryPipeline> = {
  "Health": {
    category: "Health",
    neutral: [
      { title: "Choose today’s movement", type: "Health", steps: 1, description: "Pick a realistic movement goal for today." },
      { title: "Fill your water bottle", type: "Health", steps: 1, description: "Make hydration easier for the next few hours." },
      { title: "Prep one simple meal", type: "Health", steps: 1, description: "Choose something easy that gives your body fuel." },
    ],
    recovery: [
      { title: "Take a 10-minute walk", type: "Health", steps: 1, description: "Move gently without trying to prove anything." },
      { title: "Prep one simple meal", type: "Health", steps: 1, description: "Choose something easy that gives your body fuel.", resourceTags: ["food"] },
      { title: "Stretch for 5 minutes", type: "Health", steps: 1, description: "Loosen up and lower the barrier to movement." },
      { title: "Fill your water bottle", type: "Health", steps: 1, description: "Make hydration easier for the next few hours." },
      { title: "Plan tomorrow’s movement", type: "Health", steps: 1, description: "Pick a realistic time and place." },
    ],
    progress: [
      { title: "Complete 1 hour at the gym", type: "Health", steps: 1, description: "Train with a simple plan. Do not overdo it.", resourceTags: ["gym"] },
      { title: "Cook 1 high-protein meal", type: "Health", steps: 1, description: "Make one meal that supports your energy.", resourceTags: ["food"] },
      { title: "Do a 30-minute workout", type: "Health", steps: 1, description: "Move with focus, even if it is simple." },
      { title: "Walk 8,000 steps", type: "Health", steps: 1, description: "Use walking as today’s main movement goal." },
      { title: "Prep two healthy meals", type: "Health", steps: 1, description: "Make tomorrow easier by preparing food ahead.", resourceTags: ["food"] },
      { title: "Track one health habit", type: "Health", steps: 1, description: "Notice sleep, food, movement, or water without judging." },
    ],
  },
  "Money": {
    category: "Money",
    neutral: [
      { title: "Check your balance once", type: "Money", steps: 1, description: "Look without judging. Just know where you are." },
      { title: "Write one money goal", type: "Money", steps: 1, description: "Set one realistic target for this week." },
      { title: "List one income idea", type: "Money", steps: 1, description: "Do not solve it today. Just write it down." },
    ],
    recovery: [
      { title: "Check your balance once", type: "Money", steps: 1, description: "Look without judging. Just know where you are." },
      { title: "Save one small amount", type: "Money", steps: 1, description: "Even one dollar counts as a signal." },
      { title: "Write one money worry", type: "Money", steps: 1, description: "Name it so it is not just floating in your head." },
      { title: "Delete one unnecessary cart item", type: "Money", steps: 1, description: "Remove one thing you do not really need." },
      { title: "List one income idea", type: "Money", steps: 1, description: "Do not solve it today. Just write it down." },
    ],
    progress: [
      { title: "Apply to one job", type: "Money", steps: 1, description: "Send one application or save one strong lead." },
      { title: "Work on one money skill for 30 minutes", type: "Money", steps: 1, description: "Practice a skill that can create opportunity." },
      { title: "Track today’s spending", type: "Money", steps: 1, description: "Write what went out and what it was for." },
      { title: "Save $5 or more", type: "Money", steps: 1, description: "Build the habit with a realistic amount." },
      { title: "Research one income path", type: "Money", steps: 1, description: "Find one real next step." },
      { title: "Improve your resume for 20 minutes", type: "Money", steps: 1, description: "Make one section clearer." },
    ],
  },
  "Mind": {
    category: "Mind",
    neutral: [
      { title: "Write one honest sentence", type: "Mind", steps: 1, description: "Write what happened without filtering." },
      { title: "Name one feeling", type: "Mind", steps: 1, description: "Label what is here without judging it." },
      { title: "Take one quiet minute", type: "Mind", steps: 1, description: "Sit for one minute and notice your mind." },
    ],
    recovery: [
      { title: "Write a gentle brain-dump", type: "Mind", steps: 1, description: "Empty your thoughts without organizing them." },
      { title: "Name one feeling without judging it", type: "Mind", steps: 1, description: "Label what is there." },
      { title: "Take 3 deep breaths before your next task", type: "Mind", steps: 1, description: "Create a pause before reacting." },
      { title: "Notice one thought pattern", type: "Mind", steps: 1, description: "Do not fix it. Just notice it." },
      { title: "Do one quiet minute", type: "Mind", steps: 1, description: "Sit without needing to perform." },
    ],
    progress: [
      { title: "Journal for 10 minutes", type: "Mind", steps: 1, description: "Write what happened and what pattern showed up." },
      { title: "Complete one meditation", type: "Mind", steps: 1, description: "Practice attention and coming back." },
      { title: "Reframe one harsh thought", type: "Mind", steps: 1, description: "Write the more honest version." },
      { title: "Reflect on one missed quest", type: "Mind", steps: 1, description: "Use data, not judgment." },
      { title: "Do one focused block", type: "Mind", steps: 1, description: "Choose one task and stay with it." },
      { title: "Write one lesson from today", type: "Mind", steps: 1, description: "Keep the lesson small and real." },
    ],
  },
  "Friends / Connection": {
    category: "Friends / Connection",
    neutral: [
      { title: "Think of one person you miss", type: "Connection", steps: 1, description: "No pressure to message yet. Just notice." },
      { title: "Plan one social step", type: "Connection", steps: 1, description: "Choose something realistic for today." },
      { title: "Write one connection barrier", type: "Connection", steps: 1, description: "Name what makes social steps hard." },
    ],
    recovery: [
      { title: "Think of one person you miss", type: "Connection", steps: 1, description: "No pressure to message yet. Just notice." },
      { title: "Send one low-pressure text", type: "Connection", steps: 1, description: "Keep it simple." },
      { title: "Write what makes connection hard", type: "Connection", steps: 1, description: "Name the barrier." },
      { title: "React to one friend’s post", type: "Connection", steps: 1, description: "A tiny signal still counts." },
      { title: "Plan one social step", type: "Connection", steps: 1, description: "Choose something realistic." },
    ],
    progress: [
      { title: "Text one person first", type: "Connection", steps: 1, description: "Send the message before overthinking it." },
      { title: "Start one small conversation", type: "Connection", steps: 1, description: "Ask one real question." },
      { title: "Invite someone to do something simple", type: "Connection", steps: 1, description: "Coffee, walk, study, gym, or a call.", resourceTags: ["transportation"] },
      { title: "Follow up with one person", type: "Connection", steps: 1, description: "Keep the connection alive." },
      { title: "Practice eye contact once", type: "Connection", steps: 1, description: "Use one small moment." },
      { title: "Join one group space", type: "Connection", steps: 1, description: "Class, club, server, gym, study room, or event.", resourceTags: ["transportation"] },
    ],
  },
  "School / Work": {
    category: "School / Work",
    neutral: [
      { title: "Open your top task", type: "School / Work", steps: 1, description: "Start by looking at the real task." },
      { title: "List three priorities", type: "School / Work", steps: 1, description: "Choose what matters most today." },
      { title: "Set up your workspace", type: "School / Work", steps: 1, description: "Make the next step easier.", resourceTags: ["quiet"] },
    ],
    recovery: [
      { title: "Open the assignment", type: "School / Work", steps: 1, description: "Starting means looking at it." },
      { title: "Make a 3-item task list", type: "School / Work", steps: 1, description: "Keep it short enough to use." },
      { title: "Do 10 minutes of catch-up", type: "School / Work", steps: 1, description: "Stop before it becomes too much." },
      { title: "Email or message one person", type: "School / Work", steps: 1, description: "Ask for clarity if needed." },
      { title: "Set up your workspace", type: "School / Work", steps: 1, description: "Make the next step easier.", resourceTags: ["quiet"] },
    ],
    progress: [
      { title: "Complete one focus block", type: "School / Work", steps: 1, description: "Work for 25–50 minutes on one task.", resourceTags: ["quiet"] },
      { title: "Finish one assignment section", type: "School / Work", steps: 1, description: "Choose a clear piece and complete it." },
      { title: "Review notes for 20 minutes", type: "School / Work", steps: 1, description: "Look for what you actually need to remember." },
      { title: "Start the next deadline early", type: "School / Work", steps: 1, description: "Do the first small part today." },
      { title: "Clean your task list", type: "School / Work", steps: 1, description: "Remove noise and choose the next move." },
      { title: "Submit one finished task", type: "School / Work", steps: 1, description: "Close the loop." },
    ],
  },
  "Confidence": {
    category: "Confidence",
    neutral: [
      { title: "Keep one small promise", type: "Confidence", steps: 1, description: "Choose something you can actually do." },
      { title: "Write one thing you handled", type: "Confidence", steps: 1, description: "Evidence matters." },
      { title: "Stand up and reset posture", type: "Confidence", steps: 1, description: "Change state without forcing confidence." },
    ],
    recovery: [
      { title: "Keep one small promise", type: "Confidence", steps: 1, description: "Choose something you can actually do." },
      { title: "Write one thing you handled", type: "Confidence", steps: 1, description: "Evidence matters." },
      { title: "Wear something that feels like you", type: "Confidence", steps: 1, description: "Small identity signals count." },
      { title: "Stand up and reset your posture", type: "Confidence", steps: 1, description: "Change state without forcing confidence." },
      { title: "Say one kind thing to yourself", type: "Confidence", steps: 1, description: "Make it believable, not fake." },
    ],
    progress: [
      { title: "Do one safe uncomfortable thing", type: "Confidence", steps: 1, description: "Choose a challenge that is not too big." },
      { title: "Speak once when you usually stay quiet", type: "Confidence", steps: 1, description: "One sentence counts." },
      { title: "Ask one question", type: "Confidence", steps: 1, description: "Practice being seen." },
      { title: "Finish one visible task", type: "Confidence", steps: 1, description: "Build trust with yourself." },
      { title: "Share one idea", type: "Confidence", steps: 1, description: "Put one thought into the world." },
      { title: "Practice a skill for 30 minutes", type: "Confidence", steps: 1, description: "Confidence grows from evidence." },
    ],
  },
  "Creativity": {
    category: "Creativity",
    neutral: [
      { title: "Save one idea", type: "Creativity", steps: 1, description: "Do not judge it yet." },
      { title: "Name the project", type: "Creativity", steps: 1, description: "Give the idea a place to live." },
      { title: "Collect one reference", type: "Creativity", steps: 1, description: "Find one thing that inspires the work." },
    ],
    recovery: [
      { title: "Save one idea", type: "Creativity", steps: 1, description: "Do not judge it yet." },
      { title: "Make one rough draft", type: "Creativity", steps: 1, description: "Messy counts." },
      { title: "Collect one reference", type: "Creativity", steps: 1, description: "Find one thing that inspires the work." },
      { title: "Work for 5 minutes", type: "Creativity", steps: 1, description: "Lower the pressure." },
      { title: "Name the project", type: "Creativity", steps: 1, description: "Give the idea a place to live." },
    ],
    progress: [
      { title: "Create for 30 minutes", type: "Creativity", steps: 1, description: "Stay with one project." },
      { title: "Finish one small piece", type: "Creativity", steps: 1, description: "A sketch, paragraph, beat, design, or scene." },
      { title: "Share one draft with someone", type: "Creativity", steps: 1, description: "Let it be unfinished." },
      { title: "Improve one old idea", type: "Creativity", steps: 1, description: "Revise instead of starting over." },
      { title: "Build a project outline", type: "Creativity", steps: 1, description: "Give the idea structure." },
      { title: "Practice one creative skill", type: "Creativity", steps: 1, description: "Repeat one skill with attention." },
    ],
  },
  "Sleep": {
    category: "Sleep",
    neutral: [
      { title: "Choose a realistic bedtime", type: "Sleep", steps: 1, description: "Do not aim for perfect. Aim for possible." },
      { title: "Set one pre-sleep intention", type: "Sleep", steps: 1, description: "Give tomorrow a simple direction." },
      { title: "Protect one wind-down block", type: "Sleep", steps: 1, description: "Reserve quiet time before bed." },
    ],
    recovery: [
      { title: "Protect tonight’s wind-down", type: "Sleep", steps: 1, description: "Make the last part of the day easier." },
      { title: "Dim your room early", type: "Sleep", steps: 1, description: "Lower stimulation before bed." },
      { title: "Put your phone away for 10 minutes", type: "Sleep", steps: 1, description: "Create one small break." },
      { title: "Set one pre-sleep intention", type: "Sleep", steps: 1, description: "Give tomorrow a simple direction." },
      { title: "Choose a realistic bedtime", type: "Sleep", steps: 1, description: "Do not aim for perfect. Aim for possible." },
    ],
    progress: [
      { title: "Start wind-down on time", type: "Sleep", steps: 1, description: "Follow the time you set." },
      { title: "Avoid caffeine late today", type: "Sleep", steps: 1, description: "Use your caffeine cutoff as a guide." },
      { title: "Set your sleep calendar", type: "Sleep", steps: 1, description: "Plan caffeine, meals, and wind-down." },
      { title: "Prepare tomorrow before bed", type: "Sleep", steps: 1, description: "Reduce morning friction." },
      { title: "Write one sleep reflection", type: "Sleep", steps: 1, description: "Notice what helped or hurt your rest." },
      { title: "Keep your bed routine simple", type: "Sleep", steps: 1, description: "Repeat the same first step tonight." },
    ],
  },
  "Phone Use": {
    category: "Phone Use",
    neutral: [
      { title: "Notice one scroll trigger", type: "Phone Use", steps: 1, description: "Write what pulled you in." },
      { title: "Take one phone break", type: "Phone Use", steps: 1, description: "Pause for 5 minutes without apps." },
      { title: "Charge away from bed", type: "Phone Use", steps: 1, description: "Make sleep easier tonight." },
    ],
    recovery: [
      { title: "Notice one scroll trigger", type: "Phone Use", steps: 1, description: "Write what pulled you in." },
      { title: "Move one app off your home screen", type: "Phone Use", steps: 1, description: "Make distraction less automatic." },
      { title: "Take a 5-minute phone break", type: "Phone Use", steps: 1, description: "Short breaks still count." },
      { title: "Charge your phone away from your bed", type: "Phone Use", steps: 1, description: "Make sleep easier." },
      { title: "Replace one scroll with one breath", type: "Phone Use", steps: 1, description: "Pause before opening the app." },
    ],
    progress: [
      { title: "Do one phone-free focus block", type: "Phone Use", steps: 1, description: "Put your phone away while you work." },
      { title: "Set one app limit", type: "Phone Use", steps: 1, description: "Choose the app that pulls you most." },
      { title: "Delete one distracting tab", type: "Phone Use", steps: 1, description: "Close one loop." },
      { title: "Replace 15 minutes of scrolling", type: "Phone Use", steps: 1, description: "Use the time for a small action." },
      { title: "Check screen time once", type: "Phone Use", steps: 1, description: "Look without judging." },
      { title: "Create a no-phone wind-down", type: "Phone Use", steps: 1, description: "Protect the end of the day." },
    ],
  },
  "Purpose": {
    category: "Purpose",
    neutral: [
      { title: "Write what matters today", type: "Purpose", steps: 1, description: "One sentence is enough." },
      { title: "Choose one honest step", type: "Purpose", steps: 1, description: "Small is fine if it is real." },
      { title: "Look at your path map", type: "Purpose", steps: 1, description: "Remember what you are building." },
    ],
    recovery: [
      { title: "Write what matters today", type: "Purpose", steps: 1, description: "One sentence is enough." },
      { title: "Do one honest step", type: "Purpose", steps: 1, description: "Small is fine if it is real." },
      { title: "Name what feels heavy", type: "Purpose", steps: 1, description: "Start by telling the truth." },
      { title: "Choose one thing not to force", type: "Purpose", steps: 1, description: "Let one pressure go." },
      { title: "Look at your path map", type: "Purpose", steps: 1, description: "Remember what you are building." },
    ],
    progress: [
      { title: "Work on your main path for 30 minutes", type: "Purpose", steps: 1, description: "Choose the goal that matters most." },
      { title: "Make one decision you have been avoiding", type: "Purpose", steps: 1, description: "Keep it small and clear." },
      { title: "Take one step toward your dream", type: "Purpose", steps: 1, description: "Make it concrete." },
      { title: "Ask what future you needs", type: "Purpose", steps: 1, description: "Turn the answer into one action." },
      { title: "Build one piece of your life system", type: "Purpose", steps: 1, description: "Calendar, routine, workspace, money, health, or relationships." },
      { title: "Reflect on what felt meaningful", type: "Purpose", steps: 1, description: "Notice what gave you energy." },
    ],
  },
  "General": {
    category: "General",
    neutral: [
      { title: "Complete Morning Check-In", type: "Start", steps: 1, description: "Check your energy before planning the day." },
      { title: "Review your path", type: "Plan", steps: 1, description: "Look at your top goal and choose one move." },
      { title: "Choose one small action", type: "Plan", steps: 1, description: "Keep it realistic for today." },
    ],
    recovery: [
      { title: "Choose one honest step", type: "General", steps: 1, description: "Small steps count." },
      { title: "Write what feels heavy", type: "General", steps: 1, description: "Name it so it is easier to work with." },
      { title: "Take care of one small thing", type: "General", steps: 1, description: "Do one useful task without pressure." },
      { title: "Protect your energy", type: "General", steps: 1, description: "Avoid unnecessary drains today." },
      { title: "Reflect, don’t judge", type: "General", steps: 1, description: "Use data, not self-criticism." },
    ],
    progress: [
      { title: "Complete one focus block", type: "General", steps: 1, description: "Choose one task and stay with it." },
      { title: "Move one goal forward", type: "General", steps: 1, description: "Take one visible step." },
      { title: "Send one message you’ve avoided", type: "General", steps: 1, description: "Close one open loop." },
      { title: "Save one quick thought", type: "General", steps: 1, description: "Capture one useful idea." },
      { title: "Review your path", type: "General", steps: 1, description: "Check if your action matches your goal." },
      { title: "Finish one small task", type: "General", steps: 1, description: "Build momentum with a clear win." },
    ],
  },
};

export function normalizeDreamCategory(category?: string): keyof typeof CATEGORY_PIPELINES {
  const raw = (category || "").trim().toLowerCase();

  if (!raw) return "General";
  if (raw === "health") return "Health";
  if (raw === "money") return "Money";
  if (raw === "mind") return "Mind";
  if (raw === "confidence") return "Confidence";
  if (raw === "creativity") return "Creativity";
  if (raw === "sleep") return "Sleep";
  if (raw === "phone use" || raw === "phone" || raw === "screen time") return "Phone Use";
  if (raw === "purpose") return "Purpose";
  if (raw === "school / work" || raw === "school/work" || raw === "school" || raw === "work") return "School / Work";
  if (raw === "friends / connection" || raw === "friends" || raw === "connection") return "Friends / Connection";

  return "General";
}