export function truncatePath(path: string, maxLength: number = 40): string {
  if (!path) return '';
  if (path.length <= maxLength) return path;

  const separator = path.includes('/') ? '/' : '\\';
  const parts = path.split(separator).filter(Boolean);

  if (parts.length < 3) {
    const half = Math.floor(maxLength / 2);
    return `${path.slice(0, half)}...${path.slice(-half)}`;
  }

  const root = path.startsWith(separator) ? separator : '';
  const first = parts[0];
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];

  const tail = secondLast ? `${secondLast}${separator}${last}` : last;
  const candidate = root ? `${root}${first}${separator}...${separator}${tail}` : `${first}${separator}...${separator}${tail}`;

  if (candidate.length <= maxLength) return candidate;

  return root ? `${root}${first}${separator}...${separator}${last}` : `${first}${separator}...${separator}${last}`;
}
