export function decideTextColor(color) {
  let r, g, b;
  if (color.startsWith('#')) {
    // Convert hex color to RGB values
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  } else if (color.startsWith('rgb')) {
    // Parse RGB string
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    r = parseInt(match[1]);
    g = parseInt(match[2]);
    b = parseInt(match[3]);
  } else {
    throw new Error('Unsupported color format');
  }
  
    // Calculate the perceived luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
    // Return white for dark colors and a darker shade of the background color for light colors
    if (luminance > 0.5) {
      const darkerR = Math.floor(r * 0.4);
      const darkerG = Math.floor(g * 0.4);
      const darkerB = Math.floor(b * 0.4);
  
      return `rgb(${darkerR},${darkerG},${darkerB})`;
    } else {
      return '#fff';
    }
  }
  
  export function getLighterColor(color, factor = 0.8) {
    let r, g, b;
    if (color.startsWith('#')) {
      // Convert hex color to RGB values
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    } else if (color.startsWith('rgb')) {
      // Parse RGB string
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    } else {
      throw new Error('Unsupported color format');
    }
  
    // Calculate lighter RGB values
    const lighterR = Math.min(Math.floor(r + (255 - r) * factor), 255);
    const lighterG = Math.min(Math.floor(g + (255 - g) * factor), 255);
    const lighterB = Math.min(Math.floor(b + (255 - b) * factor), 255);
  
    return `rgb(${lighterR},${lighterG},${lighterB})`;
  }
  