export async function handleAccountingMessage(incoming) {
  const parsed = parseAccountingText(incoming.text);

  if (!parsed) {
    return "记账格式可以先用：记账 午饭 28";
  }

  return `已记录：${parsed.item} ${parsed.amount} 元`;
}

function parseAccountingText(text) {
  const match = text.trim().match(/^(?:记账|消费|账单)\s+(.+?)\s+(-?\d+(?:\.\d{1,2})?)$/);

  if (!match) {
    return null;
  }

  return {
    item: match[1],
    amount: Number(match[2]),
  };
}
