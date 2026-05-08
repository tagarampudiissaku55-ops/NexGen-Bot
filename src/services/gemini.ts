import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const COLLEGE_DATA = `
College Name: Next Gen College of Engineering (NGCE)
Courses: 
- B.Tech (Computer Science, Electronics, Mechanical, Civil, AI & ML)
- MCA (Master of Computer Applications)
- MBA (Marketing, Finance, HR)
- BBA, Polytechnic (Diploma in Engineering)

Departments:
- Computer Science & Engineering (Head: Dr. Sarah Smith)
- Artificial Intelligence & Data Science
- Mechanical Engineering
- Business Administration

Admission Process:
- Admissions open from May to July.
- Eligibility: 10+2 with Physics, Chemistry, Math for B.Tech.
- Entrance Exams accepted: JEE Main, State CET.

Fees:
- B.Tech: ₹95,000/year
- MCA: ₹75,000/year
- MBA: ₹85,000/year
- Polytechnic: ₹35,000/year

Scholarships:
- Merit-based (Above 90% in 12th): 20% tuition fee waiver.
- Sports quota: 10% waiver for state-level players.
- Economic Weaker Section (EWS) support available.

Hostel & Campus:
- Separate boys and girls hostels.
- Full Wi-Fi campus, Digital Library, Smart Classrooms, Indoor Gymnastic, and Cafeteria.

Placements:
- Placed 500+ students last year.
- Top recruiters: Google, Amazon, Infosys, TCS, Wipro, Accenture.

Events:
- 'TechVishwa' (Annual Tech Fest), Hackathons, 'Cultura' (Cultural Fest), and Guest Lectures.

Contact: 
Phone: +91 9876543210
Email: info@nextgencollege.edu
Address: Next Gen Campus, Knowledge Park, City.
`;

const SYSTEM_INSTRUCTION = `
You are the Next Gen College Assistant, an intelligent and friendly AI for Next Gen College of Engineering.
Your role is to help students, parents, and visitors with accurate information about NGCE.

Instructions:
- Give clear, helpful, and concise answers (under 120 words).
- Be polite, supportive, and formal yet friendly.
- Greet users warmly ("Welcome to Next Gen College!").
- For missing data, say: "Please contact our administration at info@nextgencollege.edu for specific details."
- Use easy-to-read formatting (bullet points for lists).
- Speak naturally, as if you are a real campus guide.
- Only discuss college-related topics.

College Data:
${COLLEGE_DATA}
`;

export async function chatWithGemini(userMessage: string, history: { role: 'user' | 'model', content: string }[]) {
  // Only keep the last 10 messages to keep context concise and avoid token limits
  const recentHistory = history.slice(-10);
  
  const contents = [
    ...recentHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting right now. Please try again later or contact administration.";
  }
}
