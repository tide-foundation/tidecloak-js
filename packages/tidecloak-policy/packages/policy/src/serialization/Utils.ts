const base64abc = [
	"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
	"N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
	"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
	"n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
	"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"
];
export function bytesToBase64(bytes: Uint8Array) : string {
	let result = '', i, l = bytes.length;
	for (i = 2; i < l; i += 3) {
		result += base64abc[bytes[i - 2] >> 2];
		result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
		result += base64abc[((bytes[i - 1] & 0x0F) << 2) | (bytes[i] >> 6)];
		result += base64abc[bytes[i] & 0x3F];
	}
	if (i === l + 1) { // 1 octet yet to write
		result += base64abc[bytes[i - 2] >> 2];
		result += base64abc[(bytes[i - 2] & 0x03) << 4];
		result += "==";
	}
	if (i === l) { // 2 octets yet to write
		result += base64abc[bytes[i - 2] >> 2];
		result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
		result += base64abc[(bytes[i - 1] & 0x0F) << 2];
		result += "=";
	}
	return result;
}

export function StringToUint8Array(string: string) : Uint8Array {
	const enc = new TextEncoder();
	return enc.encode(string);
}

export function BigIntToByteArray(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error("Negative BigInt values are not supported");
  }
  
  const bytes: number[] = [];
  let temp = value;
  
  // Extract bytes in little-endian order
  while (temp > 0n) {
    bytes.push(Number(temp & 0xFFn));
    temp = temp >> 8n;
  }
  
  // Handle zero case
  if (bytes.length === 0) {
    bytes.push(0);
  }
  
  // Pad or trim to specified length
  const targetLength = bytes.length;
  const result = new Uint8Array(targetLength);
  
  for (let i = 0; i < Math.min(bytes.length, targetLength); i++) {
    result[i] = bytes[i];
  }
  
  return result;
}