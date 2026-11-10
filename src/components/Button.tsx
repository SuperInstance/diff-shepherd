import React from "react";
import { Box, Text, useInput } from "ink";

interface ButtonProps {
  label: string;
  onPress: () => void;
  hotkey?: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
}

export function Button({
  label,
  onPress,
  hotkey,
  color = "green",
  backgroundColor,
  bold = true,
}: ButtonProps) {
  useInput((input, key) => {
    if (hotkey && input === hotkey) {
      onPress();
    }
  });

  const displayLabel = hotkey ? `[${hotkey}] ${label}` : label;

  return (
    <Box>
      <Text
        bold={bold}
        color={backgroundColor ? "white" : color}
        backgroundColor={backgroundColor}
      >
        {displayLabel}
      </Text>
    </Box>
  );
}

interface ButtonRowProps {
  buttons: Array<{
    label: string;
    onPress: () => void;
    hotkey?: string;
    color?: string;
  }>;
}

export function ButtonRow({ buttons }: ButtonRowProps) {
  return (
    <Box gap={1}>
      {buttons.map((btn, i) => (
        <Button
          key={i}
          label={btn.label}
          onPress={btn.onPress}
          hotkey={btn.hotkey}
          color={btn.color}
        />
      ))}
    </Box>
  );
}
