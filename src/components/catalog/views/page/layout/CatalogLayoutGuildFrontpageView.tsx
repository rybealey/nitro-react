import { FC } from 'react';
import { Base } from '../../../../../common/Base';
import { Column } from '../../../../../common/Column';
import { Grid } from '../../../../../common/Grid';
import { LayoutImage } from '../../../../../common/layout/LayoutImage';
import { CatalogLayoutProps } from './CatalogLayout.types';

// pixelrp: no Buy group button - groups are not sold in the furni shop
// (Twist, 2026-10-29). It was the only way into the group creator.
export const CatalogLayouGuildFrontpageView: FC<CatalogLayoutProps> = props =>
{
    const { page = null } = props;

    return (
        <Grid>
            <Column size={ 7 } overflow="hidden" className="bg-muted rounded p-2 text-black">
                <Base dangerouslySetInnerHTML={ { __html: page.localization.getText(2) } } />
                <Base overflow="auto" dangerouslySetInnerHTML={ { __html: page.localization.getText(0) } } />
                <Base dangerouslySetInnerHTML={ { __html: page.localization.getText(1) } } />
            </Column>
            <Column center size={ 5 } overflow="hidden">
                <LayoutImage imageUrl={ page.localization.getImage(1) } />
            </Column>
        </Grid>
    );
}
