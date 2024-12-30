#!/usr/bin/env perl
use warnings;
use strict;

my $CMD = shift // '';
my $repl = '$Commit$';  # default for clean
if ($CMD eq 'smudge') {
  chomp( my $commit = `git rev-parse --short HEAD` );
  die "Bad commit '$commit'" unless $commit=~/\A[a-fA-F0-9]{4,}\z/;
  $repl = "\$Commit: $commit \$";
}
elsif ($CMD ne 'clean') { die "Usage: $0 smudge|clean\n" }
while (<>) {
  s{\$\s*Commit(?:\:\s+[a-fA-F0-9]+)?\s*\$}{$repl}g;
  print;
}
