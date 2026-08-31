import { NextResponse } from "next/server";

const RECIPIENT = "zecole.official@gmail.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function POST(request) {
  try {
    const payload = await request.json();
    if (payload.website) return NextResponse.json({ ok: true });

    const name = clean(payload.name, 100);
    const email = clean(payload.email, 200);
    const type = clean(payload.type, 100);
    const subject = clean(payload.subject, 200);
    const message = clean(payload.message, 5000);

    if (!name || !EMAIL_PATTERN.test(email) || !type || !subject || !message) {
      return NextResponse.json({ error: "입력한 문의 내용을 확인해 주세요." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.BUSINESS_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json({ error: "메일 전송 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: email,
        subject: `[${type}] ${subject}`,
        text: `성함 / 닉네임: ${name}\n이메일: ${email}\n문의 유형: ${type}\n\n${message}`,
      }),
    });

    if (!response.ok) {
      console.error("Business inquiry email failed", response.status, await response.text());
      return NextResponse.json({ error: "메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Business inquiry request failed", error);
    return NextResponse.json({ error: "문의 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
