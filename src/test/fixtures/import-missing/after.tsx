import React from 'react';
import { Thing } from './thing';
import { StyleSheet } from 'react-native';

export const A = () => <Thing style={styles.box} />;

const styles = StyleSheet.create({
  box: {
    margin: 4,
  },
});
