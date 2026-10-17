import React from 'react';
import { View, Text } from 'react-native';

// Set "rnStyleExtract.placement": "separateFile" (Settings), then extract here:
// a Card.styles.ts is created next to this file and imported.
export function Card({ title }: { title: string }) {
  return (
    <View style={{ borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{title}</Text>
    </View>
  );
}
