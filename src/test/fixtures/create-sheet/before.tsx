import React from 'react';
import { View, Text } from 'react-native';

export function Card({ title }: { title: string }) {
  return (
    <View style={{ <|container>flex: 1, padding: 8 }}>
      <Text>{title}</Text>
    </View>
  );
}
