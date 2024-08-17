#!/usr/bin/env perl
use 5.036;  # strict and warnings
use open qw/:std :utf8/;
# Debian/Ubuntu: `sudo apt install libio-socket-ssl-perl`  # depends on libnet-ssleay-perl
use Net::SSLeay 1.49;  # for HTTP::Tiny SSL support
use IO::Socket::SSL 1.42;  # for HTTP::Tiny SSL support
use File::Spec::Functions qw/catfile/;
use IO::Uncompress::Gunzip qw(gunzip $GunzipError);
use JSON::PP qw/decode_json/;
use Data::Dumper ();
use HTTP::Tiny;
use FindBin;
$|=1;

=head1 Synopsis

This is a script to check the German-English Dictionary formatting.
(It doesn't do a *full* parse because that would be too difficult.)

Its purpose is to check that the format of the dictionary file is
regular enough such that it can be processed as expected by the
JavaScript code (e.g., each line is "German :: English", sub-entries
are separated by "|", and that angle, square, and curly braces aren't
nested, and so on).

=head2 Author, Copyright, and License

Copyright © 2024 Hauke Dämpfling (haukex@zero-g.net)

This project is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This project is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this project; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

=cut

sub pp { Data::Dumper->new(\@_)->Terse(1)->Purity(1)->Useqq(1)->Quotekeys(0)->Sortkeys(1)->Indent(0)->Pair('=>')->Dump }

my $DICT_FILE = catfile($FindBin::Bin, 'de-en.txt.gz');
my $DICT_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt.gz';
my $ABBR_FILE = catfile($FindBin::Bin, 'src', 'js', 'abbreviations.json');

# investigate abbreviations.json
open my $jfh, '<:raw', $ABBR_FILE or die "$ABBR_FILE: $!";
my $abbr = decode_json( do { local $/; <$jfh> } );
close $jfh;
while ( my ($k,$v) = each %$abbr ) {
    $k =~ m{ \A (?:
        \[ (?<CONTENT> [ a-z A-Z . ' \x20
            \N{LATIN SMALL LETTER A WITH DIAERESIS}
            \N{LATIN SMALL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER U WITH DIAERESIS}
            \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
            ]+ )
        \] | \{ (?&CONTENT) \} | \N{REGISTERED SIGN}
    ) \z }msxxaan or die "bad abbr key ".pp($k);
    my @vk = sort keys %$v;
    die "bad abbr val ".pp($v)
        if @vk != 2 || $vk[0] ne 'de' || $vk[1] ne 'en';
    for my $vv ($$v{de}, $$v{en}) {
        # IMPORTANT: shouldn't contain HTML special characters like < > & ' "
        $vv =~ m{ \A
            [ a-z A-Z , ; : ( ) \- \x20
            \N{LATIN SMALL LETTER A WITH DIAERESIS}
            \N{LATIN SMALL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER U WITH DIAERESIS}
            \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER SHARP S}
            ]+
        \z }msxxaan or die "bad abbr val for key ".pp($k).": ".pp($vv);
    }
}

# Note that single quotes (') are not treated specially because of their varied usage (and some typos in the data):
# "can't", "hunters' parlance", "height 5' 7''", "x prime /x'/", "f';" (f-prime), and as quotes.

# Note the grammar does not treat "/Abbrev/" specially, because there are too many variations of that,
# e.g. "three eighth / 3/8 /" and "dipped [Br.] / dimmed [Am.] headlights/lights; dipped [Br.] / low [Am.] beam(s)/beam light"

my (%seen_brackets, %seen_braces);
my $LINE_GRAMMAR = qr{
    (?(DEFINE)
        (?<TOKEN>
            # REMEMBER to keep all of the special characters here in sync with equiv.ts !
            (?<LETTER>
                [ a-z A-Z
                \N{LATIN SMALL LETTER A WITH DIAERESIS}
                \N{LATIN SMALL LETTER E WITH DIAERESIS}
                \N{LATIN SMALL LETTER I WITH DIAERESIS}
                \N{LATIN SMALL LETTER O WITH DIAERESIS}
                \N{LATIN SMALL LETTER U WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER A WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER U WITH DIAERESIS}
                \N{LATIN SMALL LETTER SHARP S}
                \N{LATIN CAPITAL LETTER A WITH ACUTE}
                \N{LATIN CAPITAL LETTER E WITH ACUTE}
                \N{LATIN CAPITAL LETTER I WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER A WITH ACUTE}
                \N{LATIN SMALL LETTER E WITH ACUTE}
                \N{LATIN SMALL LETTER I WITH ACUTE}
                \N{LATIN SMALL LETTER O WITH ACUTE}
                \N{LATIN SMALL LETTER A WITH GRAVE}
                \N{LATIN SMALL LETTER E WITH GRAVE}
                \N{LATIN SMALL LETTER I WITH GRAVE}
                \N{LATIN SMALL LETTER O WITH GRAVE}
                \N{LATIN SMALL LETTER A WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER E WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER I WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER O WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER U WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER A WITH TILDE}
                \N{LATIN SMALL LETTER N WITH TILDE}
                \N{LATIN SMALL LETTER I WITH MACRON}
                \N{LATIN SMALL LETTER C WITH CEDILLA}
                \N{LATIN CAPITAL LETTER S WITH CARON}
                \N{LATIN SMALL LETTER A WITH RING ABOVE}
                \N{LATIN SMALL LETTER AE}
                \N{GREEK SMALL LETTER ALPHA}
                \N{GREEK SMALL LETTER LAMDA}
                \N{GREEK CAPITAL LETTER OMEGA}
            ] )
            # Note subscript digits happen to be in sequence in Unicode (U+2080 - U+2089), but superscripts aren't!
            | [ 0-9 \N{SUBSCRIPT ZERO} - \N{SUBSCRIPT NINE} \N{SUPERSCRIPT TWO} \N{SUPERSCRIPT THREE} ]

            # ##### ##### Special Sequences ##### #####
            # characters we would otherwise treat specially
            | (?> / \x20 \( \x20 / )     # "left parenthesis / ( /"
            | (?> / [ ) [\] <> {} ] / )  # "left square bracket /[/" etc.
            | (?> \( [<>] \) )           # "greater-than sign (>)" etc.
            | (?> [<>] \x20* [0-9] )     # greater/less than a number
            | (?> /:-\)/ )               # "Smiley"
            # special characters occurring only once
            | (?> / [ \\ \N{ACUTE ACCENT} ] / )
            | (?> \( [ @ \N{CENT SIGN} \N{YEN SIGN} \N{COPYRIGHT SIGN} ] \) )
            | (?> \( \# \x20am\x20Telefon \) )  # "Rautentaste"

            # ##### ##### Special Characters ##### #####
            # Note double colon (::), pipe (|), and semicolon (;) are separators that we explicitly don't want to match here.
            # We also treat quotation marks specially below.
            | (?!::) [ \x20 ! $ % & + , \- . / : = ? ~  ' \N{RIGHT SINGLE QUOTATION MARK}
            \N{EN DASH} \N{DEGREE SIGN} \N{SECTION SIGN} \N{HORIZONTAL ELLIPSIS} \N{MICRO SIGN}
            \N{VULGAR FRACTION ONE HALF} \N{MULTIPLICATION SIGN}
            \N{EURO SIGN} \N{POUND SIGN} \N{REGISTERED SIGN} ]
        )

        (?<STRING> (
            (?>   \N{LEFT DOUBLE QUOTATION MARK}  ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{RIGHT DOUBLE QUOTATION MARK} )  # English style
            | (?> \N{DOUBLE LOW-9 QUOTATION MARK} ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{LEFT DOUBLE QUOTATION MARK}  )  # German style
            | (?> " (?&TOKEN)++ " )
            | (?&TOKEN)*+
        )*+ )

        (?<PARENTHESES>            (?> \( (?&STRING) ( ; (?&STRING) )*+ \) ) )
        (?<BRACKETS> (?<_BRACKETS> (?> \[ (?&STRING) ( ; (?&STRING) )*+ \] ) )(?{$seen_brackets{$^N}++}) )

        (?<BRACES> (?<_BRACES> (?> \{
            (?<IN_BRACE_STR>  (
                (?> \(  # "to swing {swung (swang [obs.]); swung}"
                    (?<ONLY_BRACKET_STR> ( (?&BRACKETS) | (?&STRING) )* )
                    ( ; (?&ONLY_BRACKET_STR) )*
                \) )
                | (?&BRACKETS)  # "to clothe {clothed, clad [obs.]; clothed, clad [obs.]}"
                | (?&STRING) )*  )
            ( ; (?&IN_BRACE_STR) )*
        \} ) )(?{$seen_braces{$^N}++}) )

        (?<ANGLES>  (?> \<
            (?<IN_ANGLE_STR> (
                (?&PARENTHESES)  # "<after tax (operating) results>"
                | (?&STRING) )*  )
            ( ; (?&IN_ANGLE_STR) )*+
        \> ) )

        (?<ENTRY>  (?&ANY_BAL_LIST) ( \| (?&ANY_BAL_LIST) )* )
        (?<ANY_BAL_LIST>
            (?<ANY_BAL_STR>  (
                (?> \(
                    (?<IN_PAREN_STR> (
                        (?&PARENTHESES)  # "(formation of erosion hollows in (former) stream beds)"
                        | (?&BRACKETS)   # "Sakko {n} ({m} [Schw.])"
                        | (?&BRACES)     # "Sakko {n} ({m} [Schw.])"
                        | (?&ANGLES)     # "to put through (<> a deal)"
                        | (?&STRING) )*  )
                    ( ; (?&IN_PAREN_STR) )*
                \) )
                | (?&BRACKETS)
                | (?&BRACES)
                | (?&ANGLES)
                | (?&STRING) )*  )
            ( ; (?&ANY_BAL_STR) )*  )
    )
    \A (?<LEFT> (?&ENTRY) ) :: (?<RIGHT> (?&ENTRY) ) \z
}msxxaan;

my $resp = HTTP::Tiny->new->mirror($DICT_URL, $DICT_FILE);
$$resp{success} or die "$DICT_URL $$resp{status} $$resp{reason}".($$resp{status}==599 ? ": $$resp{content}" : '');

gunzip $DICT_FILE => \my $buffer or die "gunzip failed: $GunzipError\n";

open my $fh, '<:raw:encoding(UTF-8)', \$buffer or die $!;
my $fail_cnt = 0;
while (my $line = <$fh>) {
    chomp($line);  # remove trailing newline
    next if $line=~/^\s*#/ || $line!~/\S/;  # skip comments and blank lines
    if ( $line =~ $LINE_GRAMMAR ) {  # parse the line
        my ($de, $en) = ($+{LEFT}, $+{RIGHT});
        my @des = split m/\|/, $de;
        my @ens = split m/\|/, $en;
        @des == @ens or die "Did not get the same number of sub-entries in ".pp($line)."\n";
        #say pp \@des, \@ens;  # debugging, helps visualize runaway regex
        # use the same regex as JS uses to get "annotations":
    }
    else {
        warn "Failed to parse ".pp($line)."\n";
        die "Aborting after too many failures\n" if ++$fail_cnt>=100;
    }
}
close $fh;

say "Report: The following annotations are not contained in the abbreviations list:";
#TODO Later: entries like "{swam; swum}" are conjugations that we could filter here
my @notseen = grep {!$$abbr{$_}} sort keys %seen_brackets, keys %seen_braces;
say join(', ', @notseen );

die "$fail_cnt failures\n" if $fail_cnt;
